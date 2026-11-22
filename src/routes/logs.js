// NoSQL: User_Activity_Logs collection (CRUD). Most entries are written automatically.
const router = require('express').Router();
const { col } = require('../config');
const { auth, admin } = require('../middleware/auth');
const { ah, HttpError, oid, logActivity } = require('../utils');

const logs = () => col('user_activity_logs');

// READ (admin: everything with filters)
router.get('/', auth, admin, ah(async (req, res) => {
  const q = {};
  if (req.query.userId) q.userId = parseInt(req.query.userId, 10);
  if (req.query.action_type) q.action_type = req.query.action_type;
  res.json(await logs().find(q).sort({ timestamp: -1 }).limit(parseInt(req.query.limit, 10) || 200).toArray());
}));

// READ (own history)
router.get('/mine', auth, ah(async (req, res) => {
  res.json(await logs().find({ userId: req.user.id }).sort({ timestamp: -1 }).limit(100).toArray());
}));

// CREATE (manual entry / note)
router.post('/', auth, ah(async (req, res) => {
  const { action_type, metadata } = req.body;
  await logActivity(req.user.id, (action_type || 'MANUAL_NOTE').toUpperCase().slice(0, 40), req, metadata || {});
  res.status(201).json({ ok: true });
}));

// UPDATE (admin annotates an entry)
router.put('/:id', auth, admin, ah(async (req, res) => {
  const r = await logs().findOneAndUpdate({ _id: oid(req.params.id) },
    { $set: { 'metadata.adminNote': String(req.body.note || ''), reviewedAt: new Date() } }, { returnDocument: 'after' });
  if (!r) throw new HttpError(404, 'Log entry not found');
  res.json(r);
}));

// DELETE
router.delete('/:id', auth, admin, ah(async (req, res) => {
  const r = await logs().deleteOne({ _id: oid(req.params.id) });
  if (!r.deletedCount) throw new HttpError(404, 'Log entry not found');
  res.json({ ok: true });
}));
router.delete('/', auth, admin, ah(async (req, res) => {
  const r = await logs().deleteMany({});
  res.json({ deleted: r.deletedCount });
}));

module.exports = router;
