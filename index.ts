import "dotenv/config";
import express from "express";
import cors from "cors";
import { ENV } from "./config/env.js";
import { connectToMongoDB, closeMongoDB } from "./config/db.js";
import { sanitizeInputs } from "./middleware/security.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

// Routes
import getRoutes from "./routes/get/index.js";
import postRoutes from "./routes/post/index.js";
import patchRoutes from "./routes/patch/index.js";
import putRoutes from "./routes/put/index.js";
import deleteRoutes from "./routes/delete/index.js";

export const app = express();

// CORS configuration supporting credentials and allowed origins
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin server-to-server)
      if (!origin) return callback(null, true);

      // In development or if matching origin / vercel preview domains
      if (
        ENV.NODE_ENV === "development" ||
        origin === ENV.APP_URL ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
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
app.use(patchRoutes);
app.use(putRoutes);
app.use(deleteRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Connect to MongoDB and start HTTP listener if not running as an imported serverless module
if (process.env.NODE_ENV !== "test") {
  await connectToMongoDB();

  // Only bind port if not running in a serverless environment (e.g. Vercel Serverless Function)
  if (!process.env.VERCEL) {
    const server = app.listen(ENV.PORT, () => {
      console.log(`🚀 BookNook - Backend running on http://localhost:${ENV.PORT}`);
    });

    const gracefulShutdown = async (signal: string) => {
      console.log(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await closeMongoDB();
        process.exit(0);
      });
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  }
}

export default app;


