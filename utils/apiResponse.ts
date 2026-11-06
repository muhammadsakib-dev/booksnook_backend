// utils/apiResponse.ts

import { Response } from "express";

export function sendSuccess(
  res: Response,
  { statusCode = 200, message = "Operation successful", data = null, extra = {} }: {
    statusCode?: number;
    message?: string;
    data?: any;
    extra?: Record<string, any>;
  }
) {
  const payload = {
    success: true,
    message,
    ...(data !== null ? { data } : {}),
    ...extra,
  };
  return res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  { statusCode = 500, message = "An error occurred", code = "INTERNAL_ERROR" }: {
    statusCode?: number;
    message?: string;
    code?: string;
  }
) {
  return res.status(statusCode).json({
    success: false,
    message,
    error: {
      code,
    },
  });
}

