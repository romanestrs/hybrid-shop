require('dotenv').config();
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');

const pool = new Pool({ connectionString: process.env.PG_URL });
let mongoDb;

async function connectMongo() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  mongoDb = client.db(process.env.MONGO_DB || 'hybrid_shop');
  return mongoDb;
}
const col = (name) => mongoDb.collection(name);

module.exports = {
  pool, connectMongo, col,
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret',
  DEMO_MODE: process.env.DEMO_MODE === 'true',
};
