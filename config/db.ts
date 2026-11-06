// config/db.ts

import { MongoClient, Db } from "mongodb";
import { ENV } from "./env.js";

let client: MongoClient | null = null;
let db: Db | null = null;


export async function connectToMongoDB(): Promise<{ client: MongoClient; db: Db }> {
  try {
    client = new MongoClient(ENV.MONGODB_URL);
    await client.connect();
    db = client.db(ENV.DB_NAME);
    console.log(`MongoDB Connected : (${ENV.DB_NAME})`);
    return { client, db };
  } catch (error: any) {
    console.error("[DATABASE ERROR] Failed to connect to MongoDB:", error.message);
    throw error;
  }
}


export const getDb = (): Db => {
  if (!db) {
    throw new Error("Database not connected yet.");
  }
  return db;
};

export const getClient = (): MongoClient | null => client;

