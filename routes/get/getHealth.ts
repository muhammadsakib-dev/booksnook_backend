// routes/get/getHealth.ts

import { Router, Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";

const router = Router();

// Root status
router.get("/", (_req: Request, res: Response) => {
  return sendSuccess(res, {
    message: "BookNook Backend Service is Running!",
    data: {
      version: "2.0.0",
      status: "healthy",
      service: "BookNook API",
    },
  });
});

// Health check
router.get("/health", (_req: Request, res: Response) => {
  return sendSuccess(res, {
    message: "Server health status",
    data: {
      status: "healthy",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;

