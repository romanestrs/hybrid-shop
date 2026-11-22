// NoSQL: User_Notifications collection (CRUD)
const router = require('express').Router();
const { pool, col } = require('../config');
const { auth, admin } = require('../middleware/auth');
const { ah, HttpError, oid, logActivity } = require('../utils');

const notifs = () => col('user_notifications');

router.get('/', auth, ah(async (req, res) => {
  const list = await notifs().find({ userId: req.user.id }).sort({ sentAt: -1 }).limit(100).toArray();
  res.json({ unread: list.filter((n) => !n.isRead).length, notifications: list });
}));

// CREATE (admin): to one user or broadcast to everybody
router.post('/', auth, admin, ah(async (req, res) => {
  const { userId, title, message } = req.body;
  if (!title || !message) throw new HttpError(400, 'title and message are required');
  let ids;
  if (!userId || userId === 'all') ids = (await pool.query('SELECT user_id FROM users')).rows.map((r) => r.user_id);
  else ids = [parseInt(userId, 10)];
  const docs = ids.map((id) => ({ userId: id, title, message, isRead: false, sentAt: new Date(), broadcast: ids.length > 1 }));
  if (docs.length) await notifs().insertMany(docs);
  await logActivity(req.user.id, 'NOTIFICATION_SENT', req, { recipients: ids.length, title });
  res.status(201).json({ sent: docs.length });
}));

// UPDATE
router.put('/read-all', auth, ah(async (req, res) => {
  const r = await notifs().updateMany({ userId: req.user.id, isRead: false }, { $set: { isRead: true } });
  res.json({ updated: r.modifiedCount });
}));
router.put('/:id/read', auth, ah(async (req, res) => {
  const r = await notifs().updateOne({ _id: oid(req.params.id), userId: req.user.id }, { $set: { isRead: true } });
  if (!r.matchedCount) throw new HttpError(404, 'Notification not found');
  res.json({ ok: true });
}));

// DELETE (dismiss)
router.delete('/:id', auth, ah(async (req, res) => {
  const r = await notifs().deleteOne({ _id: oid(req.params.id), userId: req.user.id });
  if (!r.deletedCount) throw new HttpError(404, 'Notification not found');
  res.json({ ok: true });
}));

module.exports = router;
