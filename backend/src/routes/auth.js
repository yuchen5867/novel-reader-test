const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../common/database');
const { authMiddleware, createSession, deleteSession } = require('../middleware/auth');
const { checkAccessStatus, verifyAccessPassword } = require('../middleware/access');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '登录尝试过于频繁，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Check if access password is required
router.get('/check-access', checkAccessStatus);

// Verify access password
router.post('/verify-access', verifyAccessPassword);

// Login
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请提供用户名和密码' });
  }

  const adminUsername = JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_username').value);
  const adminPassword = JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password').value);

  if (username === adminUsername && password === adminPassword) {
    const session = createSession(username, true);
    res.json({ token: session.token, username: session.username });
  } else {
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

// Change password
router.put('/change-password', authMiddleware, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 3) {
    return res.status(400).json({ error: '新密码至少3位' });
  }
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(newPassword), 'admin_password');
  // Invalidate all existing sessions
  db.prepare("DELETE FROM sessions WHERE is_admin = 1 AND username = (SELECT value FROM settings WHERE key = 'admin_username')").run();
  const session = createSession(req.session.username, true);
  res.json({ token: session.token, message: '密码修改成功' });
});

// Logout
router.post('/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || '';
  if (token) deleteSession(token);
  res.json({ message: '已退出登录' });
});

module.exports = router;
