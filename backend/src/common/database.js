const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'novel-reader.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS novels (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '未命名小说',
      author TEXT DEFAULT '未知作者',
      cover_url TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      source_file_path TEXT DEFAULT '',
      ai_title TEXT DEFAULT '',
      ai_summary TEXT DEFAULT '',
      ai_tags TEXT DEFAULT '[]',
      is_completed INTEGER DEFAULT 0,
      total_chapters INTEGER DEFAULT 0,
      total_words INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_read_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      chapter_number INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      word_count INTEGER DEFAULT 0,
      is_extra INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT DEFAULT '自定义',
      color TEXT DEFAULT '#3B82F6'
    );

    CREATE TABLE IF NOT EXISTS novel_tags (
      novel_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (novel_id, tag_id),
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      scroll_position REAL DEFAULT 0,
      paragraph_index INTEGER DEFAULT 0,
      device_info TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      paragraph_index INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
      api_key TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT 'gpt-3.5-turbo',
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2000,
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS chapter_summaries (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL UNIQUE,
      novel_id TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chapter_summaries_chapter ON chapter_summaries(chapter_id);

    CREATE TABLE IF NOT EXISTS image_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT 'wan2.7-image',
      size TEXT NOT NULL DEFAULT '2K',
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chapter_images (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      novel_id TEXT NOT NULL,
      image_path TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chapter_images_chapter ON chapter_images(chapter_id);

    CREATE TABLE IF NOT EXISTS ai_tasks (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      result TEXT DEFAULT '',
      error TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_chapters_novel ON chapters(novel_id, chapter_number);
    CREATE INDEX IF NOT EXISTS idx_progress_novel ON reading_progress(novel_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_novel ON bookmarks(novel_id);
    CREATE INDEX IF NOT EXISTS idx_novel_tags_novel ON novel_tags(novel_id);
    CREATE INDEX IF NOT EXISTS idx_novel_tags_tag ON novel_tags(tag_id);
  `);

  // Add image generation columns to ai_configs (may already exist)
  for (const col of [
    'image_enabled INTEGER DEFAULT 0',
    'image_api_key TEXT DEFAULT \'\'',
    'image_model TEXT DEFAULT \'z-image-turbo\'',
    'image_size TEXT DEFAULT \'600*800\''
  ]) {
    try { db.exec(`ALTER TABLE ai_configs ADD COLUMN ${col}`); } catch (e) { /* column exists */ }
  }

  // Insert default settings if not exists
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('site_name', JSON.stringify('小说阅读器'));
  insertSetting.run('default_theme', JSON.stringify('light'));
  insertSetting.run('default_font_size', JSON.stringify(16));
  insertSetting.run('default_line_height', JSON.stringify(1.8));
  insertSetting.run('default_font_family', JSON.stringify('system'));
  insertSetting.run('max_upload_size_mb', JSON.stringify(50));
  insertSetting.run('allowed_formats', JSON.stringify(['.txt']));
  insertSetting.run('auto_ai_analysis', JSON.stringify(false));
  insertSetting.run('admin_username', JSON.stringify('admin'));
  insertSetting.run('admin_password', JSON.stringify('admin123'));
  insertSetting.run('access_password', JSON.stringify('')); // empty = no password required

  // Insert default tags
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (id, name, category, color) VALUES (?, ?, ?, ?)');
  const defaultTags = [
    // 海棠风格
    ['ht-bl', 'BL', '海棠-性向', '#FF6B9D'],
    ['ht-gl', 'GL', '海棠-性向', '#FF6B9D'],
    ['ht-bg', 'BG', '海棠-性向', '#FF6B9D'],
    ['ht-gb', 'GB', '海棠-性向', '#FF6B9D'],
    ['ht-nocp', '无CP', '海棠-性向', '#9CA3AF'],
    ['ht-modern', '现代', '海棠-题材', '#60A5FA'],
    ['ht-ancient', '古代', '海棠-题材', '#60A5FA'],
    ['ht-fantasy', '玄幻', '海棠-题材', '#60A5FA'],
    ['ht-scifi', '科幻', '海棠-题材', '#60A5FA'],
    ['ht-postapo', '末世', '海棠-题材', '#60A5FA'],
    ['ht-abo', 'ABO', '海棠-题材', '#F472B6'],
    ['ht-interstellar', '星际', '海棠-题材', '#60A5FA'],
    ['ht-serious', '正剧', '海棠-风格', '#34D399'],
    ['ht-light', '轻松', '海棠-风格', '#34D399'],
    ['ht-dark', '暗黑', '海棠-风格', '#34D399'],
    ['ht-abuse', '虐文', '海棠-风格', '#34D399'],
    ['ht-sweet', '甜文', '海棠-风格', '#34D399'],
    ['ht-cool', '爽文', '海棠-风格', '#34D399'],
    // 晋江风格
    ['jj-pure', '纯爱', '晋江-性向', '#EC4899'],
    ['jj-romance', '言情', '晋江-性向', '#EC4899'],
    ['jj-lily', '百合', '晋江-性向', '#EC4899'],
    ['jj-nocp', '无CP', '晋江-性向', '#9CA3AF'],
    ['jj-modern', '近代现代', '晋江-题材', '#8B5CF6'],
    ['jj-ancient', '古色古香', '晋江-题材', '#8B5CF6'],
    ['jj-future', '幻想未来', '晋江-题材', '#8B5CF6'],
    ['jj-game', '游戏网游', '晋江-题材', '#8B5CF6'],
    ['jj-mystery', '悬疑', '晋江-题材', '#8B5CF6'],
    ['jj-easy', '轻松', '晋江-风格', '#10B981'],
    ['jj-serious', '正剧', '晋江-风格', '#10B981'],
    ['jj-tragedy', '悲剧', '晋江-风格', '#10B981'],
    ['jj-dark', '暗黑', '晋江-风格', '#10B981'],
  ];
  for (const tag of defaultTags) {
    insertTag.run(...tag);
  }
}

module.exports = { db, initializeDatabase };
