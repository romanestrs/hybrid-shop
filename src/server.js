const express = require('express');
const path = require('path');
const { pool, connectMongo, col, DEMO_MODE } = require('./config');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/config', (req, res) => res.json({ demoMode: DEMO_MODE }));
app.use('/api', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/logs', require('./routes/logs'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 3000;
(async () => {
  try {
    await pool.query('SELECT 1');
    await connectMongo();
    await col('shopping_carts').createIndex({ userId: 1 }, { unique: true });
    app.listen(PORT, () => console.log(`Hybrid Shop running on http://localhost:${PORT}`));
  } catch (e) {
    console.error('Startup failed - are PostgreSQL and MongoDB running? Did you run "npm run db:init"?\n', e.message);
    process.exit(1);
  }
})();
