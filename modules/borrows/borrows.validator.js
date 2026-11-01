import { AppError } from "../../utils/AppError.js";
import { isValidObjectId } from "../../utils/idHelper.js";

/**
 * Validates Borrow ID parameter
 */
export function validateBorrowIdParam(req, res, next) {
  const { id } = req.params;
  if (!id || typeof id !== "string" || !id.trim()) {
    return next(new AppError("Borrow ID parameter is required", 400, "INVALID_ID"));
  }

  if (id.length === 24 && !isValidObjectId(id)) {
    return next(new AppError("Malformed ObjectId parameter", 400, "INVALID_ID"));
  }

  next();
}

/**
 * Validates Borrow Creation Request (POST /borrows)
 * Supports both single-item and multi-item Borrow Bag payloads
 */
export function validateBorrowRequest(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object") {
    return next(new AppError("Request body must be a valid JSON object", 400, "VALIDATION_ERROR"));
  }

  // Normalize single-item or batch items
  const items = Array.isArray(body.items)
    ? body.items
    : body.bookId
    ? [{ bookId: body.bookId, quantity: body.quantity || 1 }]
    : [];

  if (!items.length) {
    return next(
      new AppError(
        "Invalid borrow request: 'bookId' or non-empty 'items' array is required",
        400,
        "VALIDATION_ERROR"
      )
    );
  }

  const validatedItems = [];
  const seenBookIds = new Set();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object") {
      return next(new AppError(`Item at index ${i} is not a valid object`, 400, "VALIDATION_ERROR"));
    }

    const bookId = String(item.bookId || "").trim();
    if (!bookId) {
      return next(new AppError(`Item at index ${i} is missing bookId`, 400, "VALIDATION_ERROR"));
    }

    if (bookId.length === 24 && !isValidObjectId(bookId)) {
      return next(new AppError(`Item at index ${i} has invalid ObjectId format`, 400, "INVALID_ID"));
    }

    // Check intra-batch duplicate
    if (seenBookIds.has(bookId)) {
      return next(
        new AppError(
          `Duplicate bookId "${bookId}" in single checkout batch. Specify quantity instead.`,
          400,
          "DUPLICATE_BATCH_ITEM"
        )
      );
    }
    seenBookIds.add(bookId);

    const qty = Number(item.quantity !== undefined ? item.quantity : 1);
    if (isNaN(qty) || !Number.isInteger(qty) || qty < 1) {
      return next(
        new AppError(`Quantity for book "${bookId}" must be a positive integer >= 1`, 400, "VALIDATION_ERROR")
      );
    }

    if (qty > 10) {
      return next(
        new AppError(`Cannot borrow more than 10 copies of a single book in one request`, 400, "QUANTITY_LIMIT_EXCEEDED")
      );
    }

    validatedItems.push({
      bookId,
      quantity: qty,
    });
  }

  req.validatedBorrowItems = validatedItems;
  next();
}

