import { MongoClient } from "mongodb";
import { ENV } from "./env.js";

let client = null;
let db = null;

/**
 * Connect to MongoDB and initialize singleton DB instance
 * Configured with resilient connection pooling and server selection timeouts for production.
 */
export async function connectToMongoDB() {
  if (db && client) {
    return { client, db };
  }

  try {
    client = new MongoClient(ENV.MONGODB_URL, {
      maxPoolSize: 20,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    await client.connect();
    db = client.db(ENV.DB_NAME);
    console.log(`[DATABASE] Connected to MongoDB successfully (database: ${ENV.DB_NAME})`);
    return { client, db };
  } catch (err) {
    console.error("[DATABASE ERROR] Failed to connect to MongoDB:", err.message);
    throw err;
  }
}

/**
 * Set test database instance (for isolated testing)
 */
export function setDb(testDb, testClient = null) {
  db = testDb;
  client = testClient;
}

/**
 * Get active database instance
 */
export function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call connectToMongoDB() first.");
  }
  return db;
}

/**
 * Get active MongoClient instance (or null if mock db injected)
 */
export function getClient() {
  return client;
}

/**
 * Close database connection cleanly
 */
export async function closeMongoDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("[DATABASE] Connection closed.");
  }
}
