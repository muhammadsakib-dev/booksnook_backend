// config/db.ts
import { MongoClient } from "mongodb";
import { ENV } from "./env.js";
let client = null;
let db = null;
export async function connectToMongoDB() {
    // Return cached connection if already established (connection pooling for serverless/long-running)
    if (client && db) {
        return { client, db };
    }
    try {
        if (!ENV.MONGODB_URL) {
            throw new Error("MONGODB_URI environment variable is missing");
        }
        client = new MongoClient(ENV.MONGODB_URL);
        await client.connect();
        db = client.db(ENV.DB_NAME);
        console.log(`✅ MongoDB Connected successfully : (${ENV.DB_NAME})`);
        return { client, db };
    }
    catch (error) {
        console.error("[DATABASE ERROR] Failed to connect to MongoDB:", error.message);
        throw error;
    }
}
export const getDb = () => {
    if (!db) {
        throw new Error("Database not connected yet. Please ensure connectToMongoDB() has run.");
    }
    return db;
};
export const getClient = () => client;
export async function closeMongoDB() {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.log("MongoDB connection closed gracefully.");
    }
}
