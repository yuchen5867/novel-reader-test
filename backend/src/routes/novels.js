const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const AdmZip = require('adm-zip');
const { authMiddleware } = require('../middleware/auth');
const { accessMiddleware } = require('../middleware/access');
const { safeDecode, recognizeChapters } = require('../common/chapterRecognition');
const { db } = require('../common/database');
const {
  getNovelsList, getNovelById, updateNovel, updateNovelTags,
  updateNovelAiAnalysis, deleteNovel, batchDeleteNovels,
  processNovelFile, runWithConcurrency,
} = require('../services/novelService');

const router = express.Router();
const uploadsDir = process.env.UPLOAD_PATH || path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const novelDir = path.join(uploadsDir, 'novels');
    if (!require('fs').existsSync(novelDir)) require('fs').mkdirSync(novelDir, { recursive: true });
    cb(null, novelDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.txt', '.zip'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式，仅支持 .txt 和 .zip'));
    }
  },
});

// Get all novels
router.get('/', accessMiddleware, (req, res) => {
  const result = getNovelsList(req.query);
  res.json(result);
});

// Get novel by ID
router.get('/:id', accessMiddleware, (req, res) => {
  const novel = getNovelById(req.params.id);
  if (!novel) return res.status(404).json({ error: '小说不存在' });
  res.json(novel);
});

// Import single novel
router.post('/import', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });
    const result = await processNovelFile(req.file.path, req.file.originalname);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch import
router.post('/batch-import', authMiddleware, upload.array('files', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请选择文件' });
    }

    const tasks = req.files.map((file, i) => ({
      id: uuidv4(),
      filename: file.originalname,
      status: 'waiting',
      progress: 0,
      fileIndex: i,
    }));

    res.json({ tasks });

    await runWithConcurrency(req.files, 3, async (file, i) => {
      const task = tasks[i];
      task.status = 'processing';

      try {
        const ext = path.extname(file.originalname).toLowerCase();

        if (ext === '.zip') {
          const zip = new AdmZip(file.path);
          const entries = zip.getEntries();
          const txtEntries = entries.filter(e =>
            e.entryName.toLowerCase().endsWith('.txt') && !e.isDirectory
          );

          if (txtEntries.length === 0) {
            throw new Error('ZIP 文件中未找到 .txt 文件');
          }

          for (const entry of txtEntries) {
            const entryBuffer = entry.getData();
            const { text } = safeDecode(entryBuffer);
            const chapters = recognizeChapters(text);

            const novelId = uuidv4();
            const totalWords = chapters.reduce((sum, ch) => sum + ch.content.length, 0);
            let title = path.basename(entry.entryName, '.txt');

            db.prepare('INSERT INTO novels (id, title, total_chapters, total_words) VALUES (?, ?, ?, ?)')
              .run(novelId, title, chapters.length, totalWords);

            const insertChapter = db.prepare('INSERT INTO chapters (id, novel_id, chapter_number, title, content, word_count, is_extra) VALUES (?, ?, ?, ?, ?, ?, ?)');
            const insertMany = db.transaction((chapters) => {
              for (const ch of chapters) {
                insertChapter.run(
                  uuidv4(), novelId,
                  ch.chapterNumber != null ? ch.chapterNumber : 1,
                  ch.title || '未命名章节',
                  ch.content || '',
                  (ch.content || '').length,
                  ch.isExtra ? 1 : 0
                );
              }
            });
            insertMany(chapters);
          }

          task.status = 'completed';
          task.progress = 100;
        } else {
          const result = await processNovelFile(file.path, file.originalname);
          task.status = 'completed';
          task.progress = 100;
          task.novelId = result.id;
        }
      } catch (error) {
        task.status = 'failed';
        task.error = error.message;
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update novel
router.put('/:id', authMiddleware, (req, res) => {
  const result = updateNovel(req.params.id, req.body);
  if (result === null) return res.status(404).json({ error: '小说不存在' });
  res.json({ message: '更新成功' });
});

// Update novel tags
router.put('/:id/tags', authMiddleware, (req, res) => {
  const result = updateNovelTags(req.params.id, req.body.tag_ids);
  if (result === null) return res.status(404).json({ error: '小说不存在' });
  res.json({ message: '标签更新成功' });
});

// Update AI analysis results
router.put('/:id/ai-analysis', authMiddleware, (req, res) => {
  updateNovelAiAnalysis(req.params.id, req.body);
  res.json({ message: 'AI分析结果更新成功' });
});

// Delete novel
router.delete('/:id', authMiddleware, (req, res) => {
  const result = deleteNovel(req.params.id);
  if (result === null) return res.status(404).json({ error: '小说不存在' });
  res.json({ message: '删除成功' });
});

// Batch delete
router.post('/batch-delete', authMiddleware, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: '参数错误' });
  batchDeleteNovels(ids);
  res.json({ message: '批量删除成功' });
});

module.exports = router;
