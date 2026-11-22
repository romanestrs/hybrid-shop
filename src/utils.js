const { ObjectId } = require('mongodb');
const { col } = require('./config');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function oid(id) {
  try { return new ObjectId(String(id)); } catch { throw new HttpError(400, 'Invalid id'); }
}

// Audit record into NoSQL User_Activity_Logs (never breaks the main flow)
async function logActivity(userId, action_type, req, metadata = {}) {
  try {
    await col('user_activity_logs').insertOne({
      userId: userId ?? null, action_type,
      ip_address: req?.ip || null, metadata, timestamp: new Date(),
    });
  } catch (e) { console.error('log error', e.message); }
}

async function notify(userId, title, message) {
  await col('user_notifications').insertOne({ userId, title, message, isRead: false, sentAt: new Date() });
}

module.exports = { HttpError, ah, oid, logActivity, notify };
