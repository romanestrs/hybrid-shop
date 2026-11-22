const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

function read(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  return jwt.verify(t, JWT_SECRET);
}
const auth = (req, res, next) => {
  try { req.user = read(req); next(); }
  catch { res.status(401).json({ error: 'Authentication required' }); }
};
const optionalAuth = (req, res, next) => { try { req.user = read(req); } catch {} next(); };
const admin = (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });

module.exports = { auth, optionalAuth, admin };
