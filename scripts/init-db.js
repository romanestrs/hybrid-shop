// Creates the SQL schema, seeds demo data (SQL + NoSQL) and creates Mongo indexes.
// WARNING: drops and recreates all tables / collections.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, connectMongo, col } = require('../src/config');

(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8'));
  console.log('SQL schema created');

  const ah = await bcrypt.hash('Admin123!', 10), uh = await bcrypt.hash('User123!', 10);
  await pool.query(`INSERT INTO users(email,password_hash,full_name,role) VALUES
    ('admin@shop.local',$1,'Admin Boss','admin'),
    ('alice@shop.local',$2,'Alice Martin','customer'),
    ('bob@shop.local',$2,'Bob Durand','customer')`, [ah, uh]);

  await pool.query(`INSERT INTO products(title,description,price,stock_quantity) VALUES
    ('Mechanical Keyboard','RGB mechanical keyboard, blue switches',79.90,15),
    ('Wireless Mouse','Ergonomic 2.4GHz mouse',29.50,40),
    ('27" Monitor','QHD IPS 75Hz display',229.00,8),
    ('USB-C Hub','7-in-1 aluminium hub',39.99,25),
    ('Laptop Stand','Adjustable aluminium stand',24.90,3),
    ('Webcam HD','1080p webcam with microphone',49.00,12)`);
  console.log('SQL seed done');

  const db = await connectMongo();
  for (const c of ['user_activity_logs', 'product_reviews', 'shopping_carts', 'user_notifications'])
    await db.collection(c).deleteMany({});
  await col('shopping_carts').createIndex({ userId: 1 }, { unique: true });
  await col('product_reviews').createIndex({ productId: 1 });
  await col('user_activity_logs').createIndex({ timestamp: -1 });
  await col('user_notifications').createIndex({ userId: 1, sentAt: -1 });

  await col('product_reviews').insertMany([
    { productId: 1, userId: 2, userName: 'Alice Martin', rating: 5, comment: 'Great keyboard, very satisfying to type on!', likes: 0, likedBy: [], createdAt: new Date() },
    { productId: 1, userId: 3, userName: 'Bob Durand', rating: 4, comment: 'Good quality but a bit loud.', likes: 0, likedBy: [], createdAt: new Date() },
    { productId: 2, userId: 2, userName: 'Alice Martin', rating: 4, comment: 'Comfortable mouse, battery lasts long.', likes: 0, likedBy: [], createdAt: new Date() },
  ]);
  await col('user_notifications').insertOne({ userId: 2, title: 'Welcome!', message: 'Thanks for joining Hybrid Shop.', isRead: false, sentAt: new Date() });
  await col('user_activity_logs').insertOne({ userId: 1, action_type: 'DATABASE_SEEDED', ip_address: '127.0.0.1', metadata: { note: 'initial seed' }, timestamp: new Date() });
  console.log('Mongo seed done\nAccounts: admin@shop.local / Admin123!   alice@shop.local / User123!   bob@shop.local / User123!');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
