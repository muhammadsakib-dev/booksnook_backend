
import { AppError } from "../utils/AppError.js";

/**
 * Check nested objects and arrays for MongoDB query operators.
 */
function checkForMongoOperators(obj, path = "") {
  if (obj === null || typeof obj !== "object") return;

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    // Reject keys starting with "$"
    if (key.startsWith("$")) {
      throw new AppError(
        `MongoDB operator "${key}" is not allowed at "${currentPath}".`,
        400,
        "INVALID_INPUT"
      );
    }

    // Check nested objects and arrays recursively
    checkForMongoOperators(value, currentPath);
  }
}

/**
 * Middleware to prevent NoSQL operator injection.
 */
export function sanitizeInputs(req, res, next) {
  try {
    // Validate all incoming request data
    [req.body, req.query, req.params].forEach(checkForMongoOperators);

    next();
  } catch (error) {
    next(error);
  }
}
