const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const { HttpError } = require('./http');

// Reuse the connection between invocations of a warm serverless function.
const cache = (global._omMongo = global._omMongo || { promise: null });

async function seedAdmin(db) {
  const users = db.collection('users');
  if ((await users.estimatedDocumentCount()) > 0) return;
  const username = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!username || password.length < 8) {
    console.warn('No users exist. Set ADMIN_USERNAME and ADMIN_PASSWORD (8+ chars) to create the first admin.');
    return;
  }
  try {
    await users.insertOne({
      username,
      name: process.env.ADMIN_NAME || 'Administrator',
      role: 'admin',
      active: true,
      passwordHash: await bcrypt.hash(password, 12),
      tokenVersion: 0,
      failedLogins: 0,
      lockUntil: null,
      createdAt: new Date(),
      lastLoginAt: null
    });
    console.log(`Created first admin "${username}"`);
  } catch (e) {
    if (e.code !== 11000) throw e; // another cold start created it first
  }
}

function getDb() {
  if (!process.env.MONGODB_URI) {
    throw new HttpError(503, 'The server is not configured yet (MONGODB_URI is missing).');
  }
  if (!cache.promise) {
    cache.promise = MongoClient.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
      .then(async (client) => {
        const db = client.db(process.env.MONGODB_DB || 'om-magnet');
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        await db.collection('event_stats').createIndex({ userId: 1, eventId: 1 }, { unique: true });
        await seedAdmin(db);
        return db;
      })
      .catch((e) => {
        cache.promise = null; // let the next request retry
        console.error('MongoDB connection failed:', e.message);
        throw new HttpError(503, 'Cannot reach the database.');
      });
  }
  return cache.promise;
}

module.exports = { getDb };
