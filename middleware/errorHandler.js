import { ENV } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { sendError } from "../utils/apiResponse.js";

/**
 * 404 Not Found Middleware
 */
export function notFound(req, res, next) {
  next(new AppError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404, "NOT_FOUND"));
}

/**
 * Central Error Handling Middleware
 */
export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || "INTERNAL_ERROR";
  let message = err.message || "An unexpected error occurred on the server";

  // MongoDB / BSON Invalid ObjectId Error
  if (err.name === "BSONError" || err.name === "CastError") {
    statusCode = 400;
    code = "INVALID_ID";
    message = "Invalid identifier format provided";
  }

  // MongoDB Duplicate Key Error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    code = "DUPLICATE_KEY";
    message = "A resource with these unique attributes already exists";
  }

  // JSON Body Parsing Syntax Error
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Malformed JSON syntax in request body";
  }

  // Log in development or for critical errors
  if (ENV.NODE_ENV !== "test" && statusCode === 500) {
    console.error(`[ERROR 500] ${req.method} ${req.originalUrl}:`, err);
  }

  // In production, do not leak internal stack traces or database internals for unexpected 500 errors
  if (statusCode === 500 && !err.isOperational && ENV.NODE_ENV === "production") {
    message = "Internal server error. Please try again later.";
  }

  return sendError(res, {
    statusCode,
    message,
    code,
  });
}
