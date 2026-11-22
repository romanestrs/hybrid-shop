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

  await pool.query(`INSERT INTO products(title,description,price,stock_quantity,image_url) VALUES
    ('Paracetamol 500 mg','Pain and fever relief, box of 16 tablets',2.60,40,'/img/products/paracetamol.svg'),
    ('Vitamin C 1000','30 effervescent tablets, orange flavour',6.90,25,'/img/products/vitamin-c.svg'),
    ('Soothing hand cream','Rich daily hand cream, 50 ml tube',4.90,30,'/img/products/hand-cream.svg'),
    ('Saline nasal spray','Isotonic saline solution, 100 ml',5.50,18,'/img/products/nasal-spray.svg'),
    ('Digital thermometer','Fast reading, flexible tip, memory function',9.90,3,'/img/products/thermometer.svg'),
    ('Adhesive plasters','Assorted sizes, box of 40',3.80,50,'/img/products/bandages.svg'),
    ('Magnesium + B6','Food supplement, 60 capsules',11.90,15,'/img/products/magnesium.svg'),
    ('Sun cream SPF 50','High protection face and body, 50 ml',14.50,12,'/img/products/sunscreen.svg')`);
  console.log('SQL seed done');

  const db = await connectMongo();
  for (const c of ['user_activity_logs', 'product_reviews', 'shopping_carts', 'user_notifications'])
    await db.collection(c).deleteMany({});
  await col('shopping_carts').createIndex({ userId: 1 }, { unique: true });
  await col('product_reviews').createIndex({ productId: 1 });
  await col('user_activity_logs').createIndex({ timestamp: -1 });
  await col('user_notifications').createIndex({ userId: 1, sentAt: -1 });

  await col('product_reviews').insertMany([
    { productId: 1, userId: 2, userName: 'Alice Martin', rating: 5, comment: 'Works well and the packaging was clear.', likes: 0, likedBy: [], createdAt: new Date() },
    { productId: 1, userId: 3, userName: 'Bob Durand', rating: 4, comment: 'Arrived quickly, easy to find the leaflet.', likes: 0, likedBy: [], createdAt: new Date() },
    { productId: 3, userId: 2, userName: 'Alice Martin', rating: 4, comment: 'Pleasant texture, not sticky.', likes: 0, likedBy: [], createdAt: new Date() },
  ]);
  await col('user_notifications').insertOne({ userId: 2, title: 'Welcome!', message: 'Thanks for joining Officine.', isRead: false, sentAt: new Date() });
  await col('user_activity_logs').insertOne({ userId: 1, action_type: 'DATABASE_SEEDED', ip_address: '127.0.0.1', metadata: { note: 'initial seed' }, timestamp: new Date() });
  console.log('Mongo seed done\nAccounts: admin@shop.local / Admin123!   alice@shop.local / User123!   bob@shop.local / User123!');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
