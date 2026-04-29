const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../common/database');
const { recognizeChapters, safeDecode } = require('../common/chapterRecognition');

const uploadsDir = process.env.UPLOAD_PATH || path.join(__dirname, '..', '..', 'uploads');

function getNovelsList({ page = 1, limit = 20, search = '', tag = '', sort = 'updated_at', order = 'desc' }) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let whereClause = '';
  const params = [];

  if (search) {
    whereClause += ' WHERE (n.title LIKE ? OR n.author LIKE ? OR n.ai_title LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (tag) {
    whereClause += whereClause ? ' AND t.name = ?' : ' WHERE t.name = ?';
    params.push(tag);
  }

  const validSorts = ['title', 'author', 'created_at', 'updated_at', 'last_read_at', 'total_chapters'];
  const sortCol = validSorts.includes(sort) ? sort : 'updated_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  // Split query: get novels first, then batch-fetch tags
  const countSql = `SELECT COUNT(DISTINCT n.id) as total FROM novels n LEFT JOIN novel_tags nt ON n.id = nt.novel_id LEFT JOIN tags t ON nt.tag_id = t.id${whereClause}`;
  const total = db.prepare(countSql).get(...params).total;

  const novelSql = `SELECT n.* FROM novels n LEFT JOIN novel_tags nt ON n.id = nt.novel_id LEFT JOIN tags t ON nt.tag_id = t.id${whereClause} GROUP BY n.id ORDER BY n.${sortCol} ${sortOrder} LIMIT ? OFFSET ?`;
  const novels = db.prepare(novelSql).all(...params, parseInt(limit), offset);

  // Batch fetch tags for returned novels
  if (novels.length > 0) {
    const novelIds = novels.map(n => n.id);
    const placeholders = novelIds.map(() => '?').join(',');
    const tagRows = db.prepare(
      `SELECT nt.novel_id, t.name FROM novel_tags nt JOIN tags t ON nt.tag_id = t.id WHERE nt.novel_id IN (${placeholders})`
    ).all(...novelIds);

    const tagMap = {};
    for (const row of tagRows) {
      if (!tagMap[row.novel_id]) tagMap[row.novel_id] = [];
      tagMap[row.novel_id].push(row.name);
    }

    for (const novel of novels) {
      novel.tag_names = tagMap[novel.id] || [];
    }
  }

  return {
    data: novels.map(n => ({
      ...n,
      ai_tags: JSON.parse(n.ai_tags || '[]'),
      tag_names: n.tag_names || [],
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
}

function getNovelById(id) {
  const novel = db.prepare(`
    SELECT n.*, GROUP_CONCAT(t.name) as tag_names, GROUP_CONCAT(t.id) as tag_ids
    FROM novels n
    LEFT JOIN novel_tags nt ON n.id = nt.novel_id
    LEFT JOIN tags t ON nt.tag_id = t.id
    WHERE n.id = ?
    GROUP BY n.id
  `).get(id);

  if (!novel) return null;

  return {
    ...novel,
    ai_tags: JSON.parse(novel.ai_tags || '[]'),
    tag_names: novel.tag_names ? novel.tag_names.split(',') : [],
    tag_ids: novel.tag_ids ? novel.tag_ids.split(',') : [],
  };
}

function updateNovel(id, { title, author, summary, is_completed, cover_url }) {
  const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(id);
  if (!novel) return null;

  db.prepare(`UPDATE novels SET title = ?, author = ?, summary = ?, is_completed = ?, cover_url = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(
      title || novel.title,
      author || novel.author,
      summary || novel.summary,
      is_completed !== undefined ? is_completed : novel.is_completed,
      cover_url || novel.cover_url,
      id
    );
  return true;
}

function updateNovelTags(id, tagIds) {
  const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(id);
  if (!novel) return null;

  const updateTags = db.transaction((tagIds) => {
    db.prepare('DELETE FROM novel_tags WHERE novel_id = ?').run(id);
    const insertTag = db.prepare('INSERT OR IGNORE INTO novel_tags (novel_id, tag_id) VALUES (?, ?)');
    for (const tagId of tagIds) {
      insertTag.run(id, tagId);
    }
  });
  updateTags(tagIds || []);
  return true;
}

function updateNovelAiAnalysis(id, { ai_title, ai_summary, ai_tags }) {
  db.prepare(`UPDATE novels SET ai_title = ?, ai_summary = ?, ai_tags = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(ai_title || '', ai_summary || '', JSON.stringify(ai_tags || []), id);
}

function deleteNovel(id) {
  const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(id);
  if (!novel) return null;

  if (novel.source_file_path && fs.existsSync(novel.source_file_path)) {
    fs.unlinkSync(novel.source_file_path);
  }

  db.prepare('DELETE FROM novels WHERE id = ?').run(id);
  return true;
}

function batchDeleteNovels(ids) {
  const deleteMany = db.transaction((ids) => {
    const stmt = db.prepare('DELETE FROM novels WHERE id = ?');
    for (const id of ids) stmt.run(id);
  });
  deleteMany(ids);
}

async function processNovelFile(filePath, originalName) {
  const fileBuffer = await fsp.readFile(filePath);
  const { text, encoding, warning } = safeDecode(fileBuffer);
  const chapters = recognizeChapters(text);

  const ext = path.extname(originalName);
  let title = path.basename(originalName, ext);
  if (chapters.length > 0 && chapters[0].content) {
    const firstLine = chapters[0].content.split('\n')[0]?.trim();
    if (firstLine && firstLine.length <= 50 && !firstLine.startsWith('第')) {
      title = firstLine;
    }
  }

  const novelId = uuidv4();
  const totalWords = chapters.reduce((sum, ch) => sum + ch.content.length, 0);

  db.prepare('INSERT INTO novels (id, title, source_file_path, total_chapters, total_words) VALUES (?, ?, ?, ?, ?)')
    .run(novelId, title || '未命名小说', filePath, chapters.length, totalWords);

  const insertChapter = db.prepare('INSERT INTO chapters (id, novel_id, chapter_number, title, content, word_count, is_extra) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertMany = db.transaction((chapters) => {
    for (const ch of chapters) {
      insertChapter.run(
        uuidv4(),
        novelId,
        ch.chapterNumber != null ? ch.chapterNumber : 1,
        ch.title || '未命名章节',
        ch.content || '',
        (ch.content || '').length,
        ch.isExtra ? 1 : 0
      );
    }
  });
  insertMany(chapters);

  const novelDir = path.join(uploadsDir, 'novels', novelId);
  await fsp.mkdir(novelDir, { recursive: true });
  const destPath = path.join(novelDir, path.basename(filePath));
  await fsp.rename(filePath, destPath);
  db.prepare('UPDATE novels SET source_file_path = ? WHERE id = ?').run(destPath, novelId);

  return {
    id: novelId,
    title,
    totalChapters: chapters.length,
    totalWords,
    chapterList: chapters.map(c => ({ title: c.title, chapterNumber: c.chapterNumber, type: c.type })),
  };
}

function runWithConcurrency(tasks, concurrency, worker) {
  const results = new Array(tasks.length);
  let index = 0;

  async function workerLoop() {
    while (index < tasks.length) {
      const i = index++;
      try {
        results[i] = await worker(tasks[i], i);
      } catch (e) {
        results[i] = { error: e.message };
      }
    }
  }

  const workers = Array(Math.min(concurrency, tasks.length)).fill(null).map(() => workerLoop());
  return Promise.all(workers).then(() => results);
}

module.exports = {
  getNovelsList, getNovelById, updateNovel, updateNovelTags,
  updateNovelAiAnalysis, deleteNovel, batchDeleteNovels,
  processNovelFile, runWithConcurrency, uploadsDir,
};
