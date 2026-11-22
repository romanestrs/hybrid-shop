// SQL: Users table (CRUD)  +  NoSQL side effects (activity log, welcome notification)
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, col, JWT_SECRET } = require('../config');
const { auth, admin } = require('../middleware/auth');
const { avatarUpload } = require('../middleware/upload');
const { ah, HttpError, logActivity, notify } = require('../utils');

const token = (u) => jwt.sign({ id: u.user_id, role: u.role, email: u.email }, JWT_SECRET, { expiresIn: '8h' });
const pub = (u) => ({ user_id: u.user_id, email: u.email, full_name: u.full_name, role: u.role, avatar_url: u.avatar_url, created_at: u.created_at });

// CREATE - register
router.post('/auth/register', ah(async (req, res) => {
  const { email, password, full_name } = req.body;
  if (!email || !password || !full_name) throw new HttpError(400, 'email, password and full_name are required');
  if (password.length < 6) throw new HttpError(400, 'Password must contain at least 6 characters');
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users(email,password_hash,full_name) VALUES($1,$2,$3) RETURNING *',
      [email.toLowerCase().trim(), hash, full_name.trim()]);
    const u = rows[0];
    await logActivity(u.user_id, 'USER_REGISTERED', req, { email: u.email });
    await notify(u.user_id, 'Welcome!', `Hello ${u.full_name}, your account has been created.`);
    res.status(201).json({ token: token(u), user: pub(u) });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'This email is already registered');
    throw e;
  }
}));

router.post('/auth/login', ah(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [(email || '').toLowerCase().trim()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) {
    await logActivity(u?.user_id, 'LOGIN_FAILED', req, { email });
    throw new HttpError(401, 'Invalid email or password');
  }
  await logActivity(u.user_id, 'LOGIN', req);
  res.json({ token: token(u), user: pub(u) });
}));

// READ / UPDATE - own profile
router.get('/users/me', auth, ah(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE user_id=$1', [req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'User not found');
  res.json(pub(rows[0]));
}));

router.put('/users/me', auth, ah(async (req, res) => {
  const { full_name, email, password } = req.body;
  const hash = password ? await bcrypt.hash(password, 10) : null;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET full_name=COALESCE($1,full_name), email=COALESCE($2,email),
       password_hash=COALESCE($3,password_hash) WHERE user_id=$4 RETURNING *`,
      [full_name || null, email ? email.toLowerCase() : null, hash, req.user.id]);
    await logActivity(req.user.id, 'PROFILE_UPDATED', req, { passwordChanged: !!password });
    res.json(pub(rows[0]));
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'This email is already used');
    throw e;
  }
}));

// Avatar stored on the local file system
router.post('/users/me/avatar', auth, avatarUpload.single('avatar'), ah(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No image uploaded');
  const url = '/uploads/avatars/' + req.file.filename;
  await pool.query('UPDATE users SET avatar_url=$1 WHERE user_id=$2', [url, req.user.id]);
  await logActivity(req.user.id, 'AVATAR_UPLOADED', req, { file: req.file.filename });
  res.json({ avatar_url: url });
}));

// ADMIN - list / update role / delete
router.get('/users', auth, admin, ah(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY user_id');
  res.json(rows.map(pub));
}));

router.put('/users/:id', auth, admin, ah(async (req, res) => {
  const { role, full_name, email } = req.body;
  if (role && !['customer', 'admin'].includes(role)) throw new HttpError(400, 'Invalid role');
  const { rows } = await pool.query(
    `UPDATE users SET role=COALESCE($1,role), full_name=COALESCE($2,full_name), email=COALESCE($3,email)
     WHERE user_id=$4 RETURNING *`, [role || null, full_name || null, email || null, req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'User not found');
  await logActivity(req.user.id, 'ADMIN_USER_UPDATED', req, { target: +req.params.id, role });
  res.json(pub(rows[0]));
}));

router.delete('/users/:id', auth, admin, ah(async (req, res) => {
  if (+req.params.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account');
  try {
    const r = await pool.query('DELETE FROM users WHERE user_id=$1', [req.params.id]);
    if (!r.rowCount) throw new HttpError(404, 'User not found');
  } catch (e) {
    if (e.code === '23503') throw new HttpError(409, 'User has orders and cannot be deleted');
    throw e;
  }
  // clean the user's NoSQL data too
  const uid = +req.params.id;
  await Promise.all(['shopping_carts', 'user_notifications', 'product_reviews'].map((c) => col(c).deleteMany({ userId: uid })));
  await logActivity(req.user.id, 'ADMIN_USER_DELETED', req, { target: uid });
  res.json({ ok: true });
}));

module.exports = router;
