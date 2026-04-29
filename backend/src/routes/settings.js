const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../common/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const uploadsDir = process.env.UPLOAD_PATH || path.join(__dirname, '..', '..', 'uploads');

// Get all settings (never expose passwords)
router.get('/', (req, res) => {
  const settings = db.prepare('SELECT * FROM settings').all();
  const result = {};
  for (const s of settings) {
    try {
      result[s.key] = JSON.parse(s.value);
    } catch {
      result[s.key] = s.value;
    }
  }
  // Never expose admin_password
  delete result.admin_password;
  res.json(result);
});

// Update settings
router.put('/', authMiddleware, (req, res) => {
  const settings = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const updateMany = db.transaction((settings) => {
    for (const [key, value] of Object.entries(settings)) {
      stmt.run(key, JSON.stringify(value));
    }
  });
  updateMany(settings);
  res.json({ message: '设置更新成功' });
});

// Backup database
router.get('/backup', authMiddleware, (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `novel-reader-backup-${timestamp}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${backupName}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => { res.status(500).end(); });
  archive.pipe(res);

  const dbPath = path.join(__dirname, '..', 'data', 'novel-reader.db');
  if (fs.existsSync(dbPath)) {
    archive.file(dbPath, { name: 'novel-reader.db' });
  }

  const novelsDir = path.join(uploadsDir, 'novels');
  if (fs.existsSync(novelsDir)) {
    archive.directory(novelsDir, 'novels');
  }

  archive.finalize();
});

// Restore from backup
const restoreUpload = multer({ dest: path.join(uploadsDir, 'temp') });
router.post('/restore', authMiddleware, restoreUpload.single('backup'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择备份文件' });

    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries();

    const dbEntry = entries.find(e => e.entryName === 'novel-reader.db');
    if (dbEntry) {
      const dbPath = path.join(__dirname, '..', 'data', 'novel-reader.db');
      fs.writeFileSync(dbPath, dbEntry.getData());
    }

    const novelEntries = entries.filter(e => e.entryName.startsWith('novels/'));
    for (const entry of novelEntries) {
      if (!entry.isDirectory) {
        const destPath = path.join(uploadsDir, entry.entryName);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(destPath, entry.getData());
      }
    }

    // Clean up temp file
    try { fs.unlinkSync(req.file.path); } catch {}

    res.json({ message: '备份恢复成功，请重启服务' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tag routes
router.get('/tags', (req, res) => {
  const { category } = req.query;
  if (category) {
    res.json(db.prepare('SELECT * FROM tags WHERE category LIKE ?').all(`%${category}%`));
  } else {
    res.json(db.prepare('SELECT * FROM tags').all());
  }
});

router.post('/tags', authMiddleware, (req, res) => {
  const { name, category, color } = req.body;
  const id = uuidv4();
  try {
    db.prepare('INSERT INTO tags (id, name, category, color) VALUES (?, ?, ?, ?)')
      .run(id, name, category || '自定义', color || '#3B82F6');
    res.json({ id, name, category, color });
  } catch (e) {
    res.status(400).json({ error: '标签已存在或参数错误' });
  }
});

router.delete('/tags/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// Health check
router.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(503).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
