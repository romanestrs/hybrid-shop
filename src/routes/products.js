// SQL: Products table (CRUD) + local image upload. Ratings come from NoSQL Product_Reviews.
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { pool, col } = require('../config');
const { auth, optionalAuth, admin } = require('../middleware/auth');
const { productUpload } = require('../middleware/upload');
const { ah, HttpError, logActivity } = require('../utils');

async function ratings() {
  const agg = await col('product_reviews').aggregate([
    { $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]).toArray();
  return Object.fromEntries(agg.map((a) => [a._id, { avg: Math.round(a.avg * 10) / 10, count: a.count }]));
}

// READ - catalog (customers see active products only, admins see all)
router.get('/', optionalAuth, ah(async (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  const { rows } = await pool.query(
    `SELECT * FROM products WHERE ($1::text IS NULL OR title ILIKE '%'||$1||'%')
     AND ($2::boolean OR status='active') ORDER BY product_id DESC`, [req.query.q || null, isAdmin]);
  const r = await ratings();
  res.json(rows.map((p) => ({ ...p, price: Number(p.price), rating: r[p.product_id] || { avg: 0, count: 0 } })));
}));

router.get('/:id', ah(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE product_id=$1', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Product not found');
  const r = await ratings();
  res.json({ ...rows[0], price: Number(rows[0].price), rating: r[rows[0].product_id] || { avg: 0, count: 0 } });
}));

function parse(body) {
  const price = Number(body.price), stock = parseInt(body.stock_quantity, 10);
  if (!body.title || isNaN(price) || price < 0) throw new HttpError(400, 'Valid title and price are required');
  if (isNaN(stock) || stock < 0) throw new HttpError(400, 'Stock must be a positive integer');
  return { title: body.title, description: body.description || '', price, stock, status: body.status === 'archived' ? 'archived' : 'active' };
}

// CREATE
router.post('/', auth, admin, productUpload.single('image'), ah(async (req, res) => {
  const p = parse(req.body);
  const img = req.file ? '/uploads/products/' + req.file.filename : null;
  const { rows } = await pool.query(
    'INSERT INTO products(title,description,price,stock_quantity,image_url,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [p.title, p.description, p.price, p.stock, img, p.status]);
  await logActivity(req.user.id, 'PRODUCT_CREATED', req, { productId: rows[0].product_id });
  res.status(201).json(rows[0]);
}));

// UPDATE (also used to modify stock quantity)
router.put('/:id', auth, admin, productUpload.single('image'), ah(async (req, res) => {
  const p = parse(req.body);
  const img = req.file ? '/uploads/products/' + req.file.filename : null;
  const { rows } = await pool.query(
    `UPDATE products SET title=$1, description=$2, price=$3, stock_quantity=$4, status=$5,
     image_url=COALESCE($6,image_url) WHERE product_id=$7 RETURNING *`,
    [p.title, p.description, p.price, p.stock, p.status, img, req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Product not found');
  await logActivity(req.user.id, 'PRODUCT_UPDATED', req, { productId: rows[0].product_id, stock: p.stock });
  res.json(rows[0]);
}));

// DELETE
router.delete('/:id', auth, admin, ah(async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM products WHERE product_id=$1 RETURNING image_url', [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Product not found');
    if (rows[0].image_url && rows[0].image_url.startsWith('/uploads/')) fs.unlink(path.join(__dirname, '..', '..', rows[0].image_url), () => {});
  } catch (e) {
    if (e.code === '23503') throw new HttpError(409, 'Product is referenced by existing orders: archive it instead of deleting it');
    throw e;
  }
  const id = +req.params.id;
  await col('product_reviews').deleteMany({ productId: id });
  await col('shopping_carts').updateMany({}, { $pull: { items: { productId: id } } });
  await logActivity(req.user.id, 'PRODUCT_DELETED', req, { productId: id });
  res.json({ ok: true });
}));

module.exports = router;
