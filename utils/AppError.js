/**
 * Custom Operational Application Error Class
 */
export class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code (400, 401, 403, 404, 409, 500, etc.)
   * @param {string} code - Machine-readable error code string (e.g. VALIDATION_ERROR, NOT_FOUND)
   */
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

