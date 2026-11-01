import { AppError } from "../utils/AppError.js";

/**
 * Recursively inspects an object to ensure no MongoDB query operators (starting with '$')
 * are injected in user-supplied body or query parameters.
 */
function checkForMongoOperators(obj, path = "") {
  if (!obj || typeof obj !== "object") return;

  for (const key of Object.keys(obj)) {
    if (key.startsWith("$")) {
      throw new AppError(
        `Disallowed operator "${key}" detected in request payload at "${path ? `${path}.${key}` : key}".`,
        400,
        "INVALID_INPUT"
      );
    }

    if (typeof obj[key] === "object" && obj[key] !== null) {
      checkForMongoOperators(obj[key], path ? `${path}.${key}` : key);
    }
  }
}

/**
 * Security Middleware: Sanitizes inputs and guards against NoSQL operator injection
 */
export function sanitizeInputs(req, res, next) {
  try {
    if (req.body && typeof req.body === "object") {
      checkForMongoOperators(req.body);
    }
    if (req.query && typeof req.query === "object") {
      checkForMongoOperators(req.query);
    }
    if (req.params && typeof req.params === "object") {
      checkForMongoOperators(req.params);
    }
    next();
  } catch (err) {
    next(err);
  }
}

