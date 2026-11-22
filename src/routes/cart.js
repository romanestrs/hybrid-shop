// NoSQL: Shopping_Carts collection (CRUD)
const router = require('express').Router();
const { pool, col } = require('../config');
const { auth } = require('../middleware/auth');
const { ah, HttpError, logActivity } = require('../utils');

const carts = () => col('shopping_carts');
const total = (c) => Math.round(c.items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100;
const view = (c) => ({ items: c?.items || [], total: c ? total(c) : 0, updatedAt: c?.updatedAt || null });

// READ
router.get('/', auth, ah(async (req, res) => {
  res.json(view(await carts().findOne({ userId: req.user.id })));
}));

// CREATE - add item (price snapshot read from SQL)
router.post('/items', auth, ah(async (req, res) => {
  const productId = parseInt(req.body.productId, 10);
  const qty = parseInt(req.body.quantity || 1, 10);
  if (!productId || qty < 1) throw new HttpError(400, 'Invalid product or quantity');
  const { rows } = await pool.query("SELECT * FROM products WHERE product_id=$1 AND status='active'", [productId]);
  const p = rows[0];
  if (!p) throw new HttpError(404, 'Product not available');
  const cart = (await carts().findOne({ userId: req.user.id })) || { userId: req.user.id, items: [] };
  const ex = cart.items.find((i) => i.productId === productId);
  if (ex) { ex.quantity += qty; ex.price = Number(p.price); }
  else cart.items.push({ productId, title: p.title, quantity: qty, price: Number(p.price) });
  cart.updatedAt = new Date();
  await carts().updateOne({ userId: req.user.id }, { $set: { items: cart.items, updatedAt: cart.updatedAt } }, { upsert: true });
  await logActivity(req.user.id, 'CART_ADD', req, { productId, qty });
  res.status(201).json(view(cart));
}));

// UPDATE - quantity
router.put('/items/:productId', auth, ah(async (req, res) => {
  const qty = parseInt(req.body.quantity, 10);
  if (!qty || qty < 1) throw new HttpError(400, 'Quantity must be >= 1');
  const r = await carts().findOneAndUpdate(
    { userId: req.user.id, 'items.productId': +req.params.productId },
    { $set: { 'items.$.quantity': qty, updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!r) throw new HttpError(404, 'Item not in cart');
  await logActivity(req.user.id, 'CART_UPDATE', req, { productId: +req.params.productId, qty });
  res.json(view(r));
}));

// DELETE - one item
router.delete('/items/:productId', auth, ah(async (req, res) => {
  const r = await carts().findOneAndUpdate({ userId: req.user.id },
    { $pull: { items: { productId: +req.params.productId } }, $set: { updatedAt: new Date() } }, { returnDocument: 'after' });
  await logActivity(req.user.id, 'CART_REMOVE', req, { productId: +req.params.productId });
  res.json(view(r));
}));

// DELETE - clear cart
router.delete('/', auth, ah(async (req, res) => {
  await carts().updateOne({ userId: req.user.id }, { $set: { items: [], updatedAt: new Date() } });
  await logActivity(req.user.id, 'CART_CLEARED', req);
  res.json(view(null));
}));

module.exports = router;
