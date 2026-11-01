/**
 * Async Handler Wrapper for Express controllers
 * Catches unhandled Promise rejections and forwards to central error handler
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

