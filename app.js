import express from "express";
import { ENV } from "./config/env.js";
import { sanitizeInputs } from "./middleware/security.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { authenticate } from "./middleware/authenticate.js";
import { reconcileInventory } from "./services/inventoryService.js";
import { getDb } from "./config/db.js";
import { sendSuccess } from "./utils/apiResponse.js";
import { asyncHandler } from "./utils/asyncHandler.js";

import booksRouter from "./modules/books/books.routes.js";
import borrowsRouter from "./modules/borrows/borrows.routes.js";

const app = express();

// -------------------------------------------------------------
// 1. CORS Configuration (Supports Multi-Origin & Vercel Preview Deployments)
// -------------------------------------------------------------
const allowedOrigins = (ENV.ALLOWED_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;

  if (requestOrigin) {
    const isAllowed =
      allowedOrigins.includes("*") ||
      allowedOrigins.includes(requestOrigin) ||
      (requestOrigin.endsWith(".vercel.app") && allowedOrigins.some((o) => o.includes("vercel.app")));

    if (isAllowed) {
      res.header("Access-Control-Allow-Origin", requestOrigin);
    } else {
      res.header("Access-Control-Allow-Origin", allowedOrigins[0] || "*");
    }
  } else {
    res.header("Access-Control-Allow-Origin", allowedOrigins[0] || "*");
  }

  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// -------------------------------------------------------------
// 2. Request Parsing & Body Size Limits
// -------------------------------------------------------------
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// -------------------------------------------------------------
// 3. Security: Sanitize Inputs & Guard Against NoSQL Injection
// -------------------------------------------------------------
app.use(sanitizeInputs);

// -------------------------------------------------------------
// 4. Base & Health Endpoints
// -------------------------------------------------------------
app.get("/", (req, res) => {
  return sendSuccess(res, {
    message: "BookNook Backend Service is Running!",
    data: {
      version: "1.0.0",
      status: "healthy",
      service: "BookNook API",
    },
  });
});

app.get("/health", (req, res) => {
  return sendSuccess(res, {
    message: "Server health status",
    data: {
      status: "healthy",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

// -------------------------------------------------------------
// 5. Modular API Routes
// -------------------------------------------------------------
app.use("/books", booksRouter);
app.use("/borrows", borrowsRouter);

// Operational inventory reconciliation endpoint
app.get(
  "/inventory/reconcile",
  authenticate,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const report = await reconcileInventory({ db });
    return sendSuccess(res, {
      message: "Inventory reconciliation audit complete",
      data: report,
      extra: { report },
    });
  })
);

// -------------------------------------------------------------
// 6. Centralized Error Handling
// -------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

export default app;

