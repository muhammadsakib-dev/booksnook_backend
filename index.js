/**
 * =============================================================================
 * BookNook Backend — Entry Point (index.js)
 * =============================================================================
 * বিগেনার শিক্ষার্থীদের সহজে বোঝার জন্য কোডগুলোকে পরিচ্ছন্নভাবে সাজানো হয়েছে:
 * - GET রিকোয়েস্টের সব রাউট রয়েছে: routes/getRoutes.js
 * - POST রিকোয়েস্টের সব রাউট রয়েছে: routes/postRoutes.js
 * - UPDATE (PATCH/PUT) রিকোয়েস্টের সব রাউট রয়েছে: routes/updateRoutes.js
 * - DELETE রিকোয়েস্টের সব রাউট রয়েছে: routes/deleteRoutes.js
 * - ডাটাবেজ কানেকশন রয়েছে: config/db.js
 * - এনভায়রনমেন্ট ভ্যারিয়েবল রয়েছে: config/env.js (শুধুমাত্র একটি .env ফাইল)
 * =============================================================================
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { ENV } from "./config/env.js";
import { connectToMongoDB, getDb, getClient } from "./config/db.js";
import { sanitizeInputs } from "./middleware/security.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

// ৪টি আলাদা রাউট ফাইল ইম্পোর্ট করা হলো (GET, POST, UPDATE, DELETE)
import getRoutes from "./routes/getRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import updateRoutes from "./routes/updateRoutes.js";
import deleteRoutes from "./routes/deleteRoutes.js";

export const app = express();

// =============================================================================
// ১. মিডলওয়্যার কনফিগারেশন
// =============================================================================
// CORS হ্যান্ডলিং
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = ENV.ALLOWED_ORIGIN || "http://localhost:3000";
      if (allowed === "*" || allowed.includes(origin) || origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
    optionsSuccessStatus: 200,
  })
);

// রিকোয়েস্ট বডি পার্সিং
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ইনপুট স্যানিটাইজার (NoSQL Injection প্রোটেকশন)
app.use(sanitizeInputs);

// =============================================================================
// ২. রাউটস মাউন্ট করা (GET, POST, UPDATE, DELETE)
// =============================================================================
app.use(getRoutes);
app.use(postRoutes);
app.use(updateRoutes);
app.use(deleteRoutes);

// =============================================================================
// ৩. সেন্ট্রাল এরর হ্যান্ডলার
// =============================================================================
app.use(notFound);
app.use(errorHandler);

// =============================================================================
// ৪. সার্ভার চালু করার ফাংশন
// =============================================================================
export async function startServer() {
  try {
    await connectToMongoDB();

    const server = app.listen(ENV.PORT, () => {
      console.log(`[SERVER] BookNook running on http://localhost:${ENV.PORT}`);
    });

    return server;
  } catch (err) {
    console.error("[SERVER FATAL] Failed to start:", err);
    process.exit(1);
  }
}

// ফাইলটি সরাসরি রান করলে সার্ভার স্টার্ট হবে
if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("server.js")) {
  startServer();
}

export { connectToMongoDB, getDb, getClient };
export default app;
