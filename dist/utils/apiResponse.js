export function sendSuccess(res, { statusCode = 200, message = "Operation successful", data = null, extra = {} }) {
    const payload = {
        success: true,
        message,
        ...(data !== null ? { data } : {}),
        ...extra,
    };
    return res.status(statusCode).json(payload);
}
export function sendError(res, { statusCode = 500, message = "An error occurred", code = "INTERNAL_ERROR" }) {
    return res.status(statusCode).json({
        success: false,
        message,
        error: {
            code,
        },
    });
}
