// SQL: Orders + Order_Items (CRUD) with ATOMIC TRANSACTIONS and explicit ROLLBACK
// Hybrid sync: after COMMIT -> clear NoSQL cart, write activity log, send notification
const router = require('express').Router();
const { pool, col, DEMO_MODE } = require('../config');
const { auth, admin } = require('../middleware/auth');
const { ah, HttpError, logActivity, notify } = require('../utils');

const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

// ---------- CHECKOUT : the main transaction ----------
router.post('/checkout', auth, ah(async (req, res) => {
  const cart = await col('shopping_carts').findOne({ userId: req.user.id });
  if (!cart || !cart.items.length) throw new HttpError(400, 'Your cart is empty');
  const items = [...cart.items].sort((a, b) => a.productId - b.productId); // stable lock order -> no deadlocks
  const address = (req.body.shipping_address || '').trim() || 'Not provided';

  const client = await pool.connect();
  let order;
  try {
    await client.query('BEGIN');
    let total = 0;
    const lines = [];

    for (const it of items) {
      // 1. verify stock (row locked until commit)
      const { rows } = await client.query(
        'SELECT product_id,title,price,stock_quantity,status FROM products WHERE product_id=$1 FOR UPDATE', [it.productId]);
      const p = rows[0];
      if (!p || p.status !== 'active') throw new HttpError(409, `"${it.title}" is no longer available`);
      if (p.stock_quantity < it.quantity)
        throw new HttpError(409, `Insufficient stock for "${p.title}" (requested ${it.quantity}, available ${p.stock_quantity})`);
      // 2. deduct stock
      await client.query('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE product_id=$2', [it.quantity, p.product_id]);
      total += Number(p.price) * it.quantity;
      lines.push({ product_id: p.product_id, price: Number(p.price), quantity: it.quantity });
    }

    // 3. create order header
    const o = await client.query(
      'INSERT INTO orders(user_id,total_amount,shipping_address) VALUES($1,$2,$3) RETURNING *',
      [req.user.id, total.toFixed(2), address]);

    // DEMO ONLY: forces a failure after stock was deducted and the order inserted, to prove the rollback
    if (DEMO_MODE && req.body.simulateFailure) throw new HttpError(500, 'Simulated failure before inserting order items (rollback demo)');

    // 4. insert line items
    for (const l of lines)
      await client.query('INSERT INTO order_items(order_id,product_id,unit_price,quantity) VALUES($1,$2,$3,$4)',
        [o.rows[0].order_id, l.product_id, l.price, l.quantity]);

    await client.query('COMMIT');
    order = o.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');                        // 5. explicit rollback: nothing is kept
    await logActivity(req.user.id, 'CHECKOUT_ROLLBACK', req, { reason: e.message });
    await notify(req.user.id, 'Order failed', `Your order was not placed: ${e.message}`).catch(() => {});
    if (!e.status) e.status = 500;
    throw e;
  } finally { client.release(); }

  // ---------- Cross-database synchronisation (after successful SQL commit) ----------
  const sync = { cartCleared: false, logged: false, notified: false };
  try { await col('shopping_carts').updateOne({ userId: req.user.id }, { $set: { items: [], updatedAt: new Date() } }); sync.cartCleared = true; } catch (e) { console.error(e); }
  try { await logActivity(req.user.id, 'ORDER_PLACED', req, { orderId: order.order_id, total: Number(order.total_amount), items: items.length }); sync.logged = true; } catch (e) { console.error(e); }
  try { await notify(req.user.id, `Order #${order.order_id} confirmed`, `Thank you! Your order of ${Number(order.total_amount).toFixed(2)} € has been placed.`); sync.notified = true; } catch (e) { console.error(e); }

  res.status(201).json({ order, sync });
}));

// ---------- READ ----------
router.get('/', auth, ah(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { rows } = await pool.query(
    `SELECT o.*, u.email, u.full_name, COUNT(oi.item_id)::int AS items_count
     FROM orders o JOIN users u ON u.user_id=o.user_id
     LEFT JOIN order_items oi ON oi.order_id=o.order_id
     WHERE ($1::boolean OR o.user_id=$2)
     GROUP BY o.order_id, u.email, u.full_name ORDER BY o.created_at DESC`, [isAdmin, req.user.id]);
  res.json(rows.map((r) => ({ ...r, total_amount: Number(r.total_amount) })));
}));

router.get('/:id', auth, ah(async (req, res) => {
  const o = await pool.query('SELECT o.*, u.email FROM orders o JOIN users u ON u.user_id=o.user_id WHERE o.order_id=$1', [req.params.id]);
  if (!o.rows[0]) throw new HttpError(404, 'Order not found');
  if (req.user.role !== 'admin' && o.rows[0].user_id !== req.user.id) throw new HttpError(403, 'Forbidden');
  const items = await pool.query(
    `SELECT oi.*, p.title, p.image_url FROM order_items oi JOIN products p ON p.product_id=oi.product_id
     WHERE oi.order_id=$1 ORDER BY oi.item_id`, [req.params.id]);
  res.json({ ...o.rows[0], items: items.rows.map((i) => ({ ...i, unit_price: Number(i.unit_price) })) });
}));

// helper: lock an order & check permission inside a transaction
async function lockOrder(client, req) {
  const { rows } = await client.query('SELECT * FROM orders WHERE order_id=$1 FOR UPDATE', [req.params.id]);
  const o = rows[0];
  if (!o) throw new HttpError(404, 'Order not found');
  if (req.user.role !== 'admin') {
    if (o.user_id !== req.user.id) throw new HttpError(403, 'Forbidden');
    if (o.order_status !== 'pending') throw new HttpError(409, 'Only pending orders can be modified by the customer');
  }
  return o;
}
const restoreStock = (client, orderId) => client.query(
  `UPDATE products p SET stock_quantity = p.stock_quantity + oi.quantity
   FROM order_items oi WHERE oi.product_id=p.product_id AND oi.order_id=$1`, [orderId]);

// ---------- UPDATE status (admin) - cancelling restores stock atomically ----------
router.put('/:id/status', auth, admin, ah(async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
  const client = await pool.connect();
  let o;
  try {
    await client.query('BEGIN');
    const cur = await lockOrder(client, req);
    if (status === 'cancelled' && cur.order_status !== 'cancelled') await restoreStock(client, cur.order_id);
    if (cur.order_status === 'cancelled' && status !== 'cancelled') throw new HttpError(409, 'A cancelled order cannot be re-opened');
    o = (await client.query('UPDATE orders SET order_status=$1 WHERE order_id=$2 RETURNING *', [status, cur.order_id])).rows[0];
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await logActivity(req.user.id, 'ORDER_STATUS_UPDATED', req, { orderId: o.order_id, status });
  await notify(o.user_id, `Order #${o.order_id} updated`, `Your order is now "${status}".`);
  res.json(o);
}));

// ---------- DELETE one order line (cancel line item) ----------
router.delete('/:id/items/:itemId', auth, ah(async (req, res) => {
  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    const o = await lockOrder(client, req);
    if (o.order_status === 'cancelled') throw new HttpError(409, 'Order already cancelled');
    const it = (await client.query('DELETE FROM order_items WHERE item_id=$1 AND order_id=$2 RETURNING *', [req.params.itemId, o.order_id])).rows[0];
    if (!it) throw new HttpError(404, 'Line item not found');
    await client.query('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE product_id=$2', [it.quantity, it.product_id]);
    const t = await client.query('SELECT COALESCE(SUM(unit_price*quantity),0) AS t, COUNT(*)::int AS n FROM order_items WHERE order_id=$1', [o.order_id]);
    const status = t.rows[0].n === 0 ? 'cancelled' : o.order_status;
    result = (await client.query('UPDATE orders SET total_amount=$1, order_status=$2 WHERE order_id=$3 RETURNING *', [t.rows[0].t, status, o.order_id])).rows[0];
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await logActivity(req.user.id, 'ORDER_ITEM_REMOVED', req, { orderId: result.order_id, itemId: +req.params.itemId });
  res.json(result);
}));

// ---------- DELETE a whole order (stock restored if it was not cancelled) ----------
router.delete('/:id', auth, ah(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const o = await lockOrder(client, req);
    if (o.order_status !== 'cancelled') await restoreStock(client, o.order_id);
    await client.query('DELETE FROM orders WHERE order_id=$1', [o.order_id]); // items removed by ON DELETE CASCADE
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await logActivity(req.user.id, 'ORDER_DELETED', req, { orderId: +req.params.id });
  res.json({ ok: true });
}));

module.exports = router;
