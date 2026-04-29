const crypto = require('crypto');
const { db } = require('../common/database');

const ACCESS_TOKEN_VALIDITY_DAYS = 30;
const SERVER_SECRET = process.env.SERVER_SECRET || 'novel-reader-secret-change-me';

function accessMiddleware(req, res, next) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'access_password'").get();
  const accessPassword = JSON.parse(row.value);

  if (!accessPassword) return next();

  const token = req.headers['x-access-token'] || req.query.access_token || '';

  if (!token) {
    return res.status(401).json({ error: '需要访问密码', code: 'ACCESS_REQUIRED' });
  }

  try {
    const [payload, sig] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', SERVER_SECRET)
      .update(payload).digest('base64url');
    if (sig !== expectedSig) throw new Error('invalid');

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (data.exp < Date.now()) throw new Error('expired');
    if (data.pwd !== accessPassword) throw new Error('password changed');
  } catch (e) {
    return res.status(401).json({ error: '访问密码无效或已过期', code: 'INVALID_TOKEN' });
  }

  next();
}

function checkAccessStatus(req, res) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'access_password'").get();
  const accessPassword = JSON.parse(row.value);
  res.json({ needsPassword: !!accessPassword });
}

function verifyAccessPassword(req, res) {
  const { password } = req.body;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'access_password'").get();
  const accessPassword = JSON.parse(row.value);

  if (!accessPassword) {
    return res.json({ token: '', message: '无需密码' });
  }

  if (password !== accessPassword) {
    return res.status(401).json({ error: '密码错误' });
  }

  const payload = { pwd: accessPassword, exp: Date.now() + ACCESS_TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000 };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_SECRET).update(payloadStr).digest('base64url');
  const token = `${payloadStr}.${sig}`;

  res.json({ token, message: '验证成功' });
}

module.exports = { accessMiddleware, checkAccessStatus, verifyAccessPassword };
