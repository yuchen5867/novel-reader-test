const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const { db, initializeDatabase } = require('./common/database');
const { cleanupExpiredSessions } = require('./middleware/auth');

// Initialize
initializeDatabase();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(compression());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files
const uploadsDir = process.env.UPLOAD_PATH || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Periodic cleanup
setInterval(() => {
  try {
    cleanupExpiredSessions();
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (e) { /* ignore cleanup errors */ }
}, 30 * 60 * 1000);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/novels', require('./routes/novels'));
app.use('/api', require('./routes/chapters'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api', require('./routes/settings'));

// Serve Frontend (Production)
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求体过大' });
  }
  console.error('[Error]', err.message);
  res.status(500).json({ error: '服务器内部错误' });
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch (e) { /* ignore */ }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
app.listen(PORT, HOST, () => {
  console.log(`\n📚 Novel Reader service started`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Local:    http://localhost:${PORT}`);
  console.log(`  Admin:    http://localhost:${PORT}/admin`);
  console.log(`  Health:   http://localhost:${PORT}/api/health`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
