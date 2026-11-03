// Complete Database Connection

import { MongoClient } from "mongodb";
import { ENV } from "./env.js";

let client = null;
let db = null;

export async function connectToMongoDB() {
  try {
    client = new MongoClient(ENV.MONGODB_URL);
    await client.connect();
    db = client.db(ENV.DB_NAME);
    console.log(`[DATABASE] MongoDB Connected (${ENV.DB_NAME})`);
    return { client, db };
  } catch (error) {
    console.error("[DATABASE ERROR] Failed to connect to MongoDB:", error.message);
    throw error;
  }
}

export const getDb = () => db;
export const getClient = () => client;