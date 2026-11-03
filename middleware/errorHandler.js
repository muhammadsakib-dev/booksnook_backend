
import { ENV } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { sendError } from "../utils/apiResponse.js";

/**
 * Handle undefined API routes (404 Not Found).
 */
export function notFound(req, res, next) {
  next(
    new AppError(
      `Endpoint not found: ${req.method} ${req.originalUrl}`,
      404,
      "NOT_FOUND"
    )
  );
}

/**
 * Centralized Error Handler.
 * Handles application, database and server errors.
 */
export function errorHandler(err, req, res, next) {
  // Default error information
  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || "INTERNAL_ERROR";
  let message = err.message || "An unexpected error occurred";

  // Invalid MongoDB ObjectId
  if (err.name === "BSONError" || err.name === "CastError") {
    statusCode = 400;
    code = "INVALID_ID";
    message = "Invalid identifier format";
  }

  // MongoDB Duplicate Key
  if (err.code === 11000) {
    statusCode = 409;
    code = "DUPLICATE_KEY";
    message = "A resource with these details already exists";
  }

  // Invalid JSON request body
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Invalid JSON format";
  }

  // Log server errors (except during tests)
  if (statusCode === 500 && ENV.NODE_ENV !== "test") {
    console.error(`[ERROR 500] ${req.method} ${req.originalUrl}:`, err);
  }

  // Hide internal error details in production
  if (
    statusCode === 500 &&
    !err.isOperational &&
    ENV.NODE_ENV === "production"
  ) {
    message = "Internal server error. Please try again later.";
  }

  // Send consistent error response
  return sendError(res, {
    statusCode,
    message,
    code,
  });
}
