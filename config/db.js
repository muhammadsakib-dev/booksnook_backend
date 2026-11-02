import { MongoClient } from "mongodb";
import { ENV } from "./env.js";

let client = null;
let db = null;

/**
 * MongoDB ডাটাবেজ কানেক্ট করার ফাংশন
 */
export async function connectToMongoDB() {
  if (db && client) {
    return { client, db };
  }

  try {
    client = new MongoClient(ENV.MONGODB_URL);
    await client.connect();
    db = client.db(ENV.DB_NAME);
    console.log(`[DATABASE] MongoDB Connected successfully (Database: ${ENV.DB_NAME})`);
    return { client, db };
  } catch (err) {
    console.error("[DATABASE ERROR] Failed to connect to MongoDB:", err.message);
    throw err;
  }
}

/**
 * টেস্টের জন্য মক ডাটাবেজ সেট করার ফাংশন
 */
export function setDb(testDb, testClient = null) {
  db = testDb;
  client = testClient;
}

/**
 * রানিং ডাটাবেজ ইনস্ট্যান্স পাওয়ার ফাংশন
 */
export function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call connectToMongoDB() first.");
  }
  return db;
}

/**
 * MongoClient পাওয়ার ফাংশন
 */
export function getClient() {
  return client;
}

/**
 * ডাটাবেজ কানেকশন বন্ধ করার ফাংশন
 */
export async function closeMongoDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("[DATABASE] Connection closed.");
  }
}
