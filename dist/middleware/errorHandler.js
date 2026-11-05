import { AppError } from "../utils/AppError.js";
import { sendError } from "../utils/apiResponse.js";
export function notFound(req, res, next) {
    next(new AppError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404, "NOT_FOUND"));
}
export function errorHandler(err, req, res, next) {
    let statusCode = err.statusCode || err.status || 500;
    let code = err.code || "INTERNAL_ERROR";
    let message = err.message || "An unexpected error occurred";
    if (err.name === "BSONError" || err.name === "CastError") {
        statusCode = 400;
        code = "INVALID_ID";
        message = "Invalid identifier format";
    }
    if (err.code === 11000) {
        statusCode = 409;
        code = "DUPLICATE_KEY";
        message = "A resource with these details already exists";
    }
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        statusCode = 400;
        code = "INVALID_JSON";
        message = "Invalid JSON format";
    }
    return sendError(res, {
        statusCode,
        message,
        code,
    });
}
