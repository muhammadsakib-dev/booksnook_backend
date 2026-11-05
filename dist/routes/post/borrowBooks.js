import { Router } from "express";
import { getDb, getClient } from "../../config/db.js";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { AppError } from "../../utils/AppError.js";
import { isValidObjectId } from "../../utils/idHelper.js";
import { borrowBooks } from "../../services/inventoryService.js";
const router = Router();
// Borrow books batch
router.post("/borrows", authenticate, asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object") {
        throw new AppError("Request body must be a valid JSON object", 400, "VALIDATION_ERROR");
    }
    const items = Array.isArray(body.items)
        ? body.items
        : body.bookId
            ? [{ bookId: body.bookId, quantity: body.quantity || 1 }]
            : [];
    if (!items.length) {
        throw new AppError("Invalid borrow request: 'bookId' or non-empty 'items' array is required", 400, "VALIDATION_ERROR");
    }
    const validatedItems = [];
    const seenBookIds = new Set();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== "object") {
            throw new AppError(`Item at index ${i} is not a valid object`, 400, "VALIDATION_ERROR");
        }
        const bookId = String(item.bookId || "").trim();
        if (!bookId) {
            throw new AppError(`Item at index ${i} is missing bookId`, 400, "VALIDATION_ERROR");
        }
        if (bookId.length === 24 && !isValidObjectId(bookId)) {
            throw new AppError(`Item at index ${i} has invalid ObjectId format`, 400, "INVALID_ID");
        }
        if (seenBookIds.has(bookId)) {
            throw new AppError(`Duplicate bookId "${bookId}" in single checkout batch. Specify quantity instead.`, 400, "DUPLICATE_BATCH_ITEM");
        }
        seenBookIds.add(bookId);
        const qty = Number(item.quantity !== undefined ? item.quantity : 1);
        if (isNaN(qty) || !Number.isInteger(qty) || qty < 1) {
            throw new AppError(`Quantity for book "${bookId}" must be a positive integer >= 1`, 400, "VALIDATION_ERROR");
        }
        if (qty > 10) {
            throw new AppError("Cannot borrow more than 10 copies of a single book in one request", 400, "QUANTITY_LIMIT_EXCEEDED");
        }
        validatedItems.push({ bookId, quantity: qty });
    }
    const db = getDb();
    const client = getClient();
    const createdBorrows = await borrowBooks({
        client,
        db,
        user: req.user,
        items: validatedItems,
    });
    const count = createdBorrows.length;
    const message = `Borrow confirmed for ${count} ${count === 1 ? "book" : "books"}`;
    return sendSuccess(res, {
        statusCode: 201,
        message,
        data: createdBorrows,
        extra: {
            borrow: createdBorrows[0],
            borrows: createdBorrows,
        },
    });
}));
export default router;
