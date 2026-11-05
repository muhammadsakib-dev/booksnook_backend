/**
 * BookNook Backend - Application Entry Point
 *
 * Modular Route Architecture:
 * - GET: routes/get/
 * - POST: routes/post/
 * - PATCH: routes/patch/
 * - PUT: routes/put/
 * - DELETE: routes/delete/
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { ENV } from "./config/env.js";
import { connectToMongoDB } from "./config/db.js";
import { sanitizeInputs } from "./middleware/security.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

// Routes
import getRoutes from "./routes/get/index.js";
import postRoutes from "./routes/post/index.js";
import patchRoutes from "./routes/patch/index.js";
import putRoutes from "./routes/put/index.js";
import deleteRoutes from "./routes/delete/index.js";

export const app = express();

// CORS configuration
app.use(cors({ origin: true, credentials: true }));

// Body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// NoSQL operator sanitizer
app.use(sanitizeInputs);

// Mount routes
app.use(getRoutes);
app.use(postRoutes);
app.use(patchRoutes);
app.use(putRoutes);
app.use(deleteRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Connect to MongoDB and start server
await connectToMongoDB();

app.listen(ENV.PORT, () => {
  console.log(`🚀 BookNook running on http://localhost:${ENV.PORT}`);
});

export default app;

