// NoSQL: Product_Reviews collection (CRUD + likes)
const router = require('express').Router();
const { pool, col } = require('../config');
const { auth } = require('../middleware/auth');
const { ah, HttpError, oid, logActivity } = require('../utils');

const reviews = () => col('product_reviews');
const check = (rating, comment) => {
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Rating must be between 1 and 5');
  if (!comment || !comment.trim()) throw new HttpError(400, 'Comment is required');
};

// READ - reviews of a product + average
router.get('/', ah(async (req, res) => {
  const productId = parseInt(req.query.productId, 10);
  const list = await reviews().find(productId ? { productId } : {}).sort({ createdAt: -1 }).toArray();
  const avg = list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10 : 0;
  res.json({ average: avg, count: list.length, reviews: list });
}));

// CREATE
router.post('/', auth, ah(async (req, res) => {
  const productId = parseInt(req.body.productId, 10);
  const rating = parseInt(req.body.rating, 10);
  check(rating, req.body.comment);
  const { rows } = await pool.query('SELECT 1 FROM products WHERE product_id=$1', [productId]);
  if (!rows[0]) throw new HttpError(404, 'Product not found');
  if (await reviews().findOne({ productId, userId: req.user.id })) throw new HttpError(409, 'You already reviewed this product (edit your review instead)');
  const u = await pool.query('SELECT full_name FROM users WHERE user_id=$1', [req.user.id]);
  const doc = { productId, userId: req.user.id, userName: u.rows[0]?.full_name, rating, comment: req.body.comment.trim(), likes: 0, likedBy: [], createdAt: new Date() };
  const r = await reviews().insertOne(doc);
  await logActivity(req.user.id, 'REVIEW_POSTED', req, { productId, rating });
  res.status(201).json({ ...doc, _id: r.insertedId });
}));

// UPDATE (author only)
router.put('/:id', auth, ah(async (req, res) => {
  const rating = parseInt(req.body.rating, 10);
  check(rating, req.body.comment);
  const r = await reviews().findOneAndUpdate({ _id: oid(req.params.id), userId: req.user.id },
    { $set: { rating, comment: req.body.comment.trim(), updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!r) throw new HttpError(404, 'Review not found or not yours');
  await logActivity(req.user.id, 'REVIEW_EDITED', req, { reviewId: req.params.id });
  res.json(r);
}));

// like toggle
router.post('/:id/like', auth, ah(async (req, res) => {
  const doc = await reviews().findOne({ _id: oid(req.params.id) });
  if (!doc) throw new HttpError(404, 'Review not found');
  const liked = (doc.likedBy || []).includes(req.user.id);
  const r = await reviews().findOneAndUpdate({ _id: doc._id },
    liked ? { $pull: { likedBy: req.user.id }, $inc: { likes: -1 } } : { $addToSet: { likedBy: req.user.id }, $inc: { likes: 1 } },
    { returnDocument: 'after' });
  res.json(r);
}));

// DELETE (author or admin)
router.delete('/:id', auth, ah(async (req, res) => {
  const q = { _id: oid(req.params.id) };
  if (req.user.role !== 'admin') q.userId = req.user.id;
  const r = await reviews().deleteOne(q);
  if (!r.deletedCount) throw new HttpError(404, 'Review not found or not yours');
  await logActivity(req.user.id, 'REVIEW_DELETED', req, { reviewId: req.params.id });
  res.json({ ok: true });
}));

module.exports = router;
