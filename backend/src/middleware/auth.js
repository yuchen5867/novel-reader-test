const crypto = require('crypto');
const { db } = require('../common/database');

const SESSION_DURATION_HOURS = 24;

function createSession(username, isAdmin = true) {
  const id = require('uuid').v4();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO sessions (id, token, username, is_admin, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, token, username, isAdmin ? 1 : 0, expiresAt);

  return { token, username, expiresAt };
}

function validateSession(token) {
  if (!token) return null;
  const session = db.prepare(
    "SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')"
  ).get(token);
  return session || null;
}

function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function cleanupExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

function authMiddleware(req, res, next) {
  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader) {
    token = authHeader.replace('Bearer ', '');
  } else if (req.query.token) {
    token = req.query.token;
  } else if (req.body && req.body.token) {
    token = req.body.token;
  }

  if (!token) {
    return res.status(401).json({ error: '未授权访问，请先登录' });
  }

  const session = validateSession(token);
  if (!session) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }

  req.session = session;
  next();
}

module.exports = { createSession, validateSession, deleteSession, cleanupExpiredSessions, authMiddleware };
