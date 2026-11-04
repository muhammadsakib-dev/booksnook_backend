/**
 * BookNook Backend - Application Entry Point
 *
 * Modular Route Architecture:
 * - GET: routes/getRoutes.js
 * - POST: routes/postRoutes.js
 * - UPDATE: routes/updateRoutes.js
 * - DELETE: routes/deleteRoutes.js
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { ENV } from "./config/env.js";
import { connectToMongoDB, getDb, getClient } from "./config/db.js";
import { sanitizeInputs } from "./middleware/security.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

// Routes
import getRoutes from "./routes/getRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import updateRoutes from "./routes/updateRoutes.js";
import deleteRoutes from "./routes/deleteRoutes.js";

export const app = express();

// CORS configuration
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

// Body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// NoSQL operator sanitizer
app.use(sanitizeInputs);

// Mount routes
app.use(getRoutes);
app.use(postRoutes);
app.use(updateRoutes);
app.use(deleteRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
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

// Auto-start when executed directly
if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("server.js")) {
  startServer();
}

export { connectToMongoDB, getDb, getClient };
export default app;
