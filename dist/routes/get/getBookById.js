import { Router } from "express";
import { getDb } from "../../config/db.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { AppError } from "../../utils/AppError.js";
import { isValidObjectId, getBookQuery } from "../../utils/idHelper.js";
const router = Router();
// Get single book details
router.get("/books/:id", asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id || typeof id !== "string" || !id.trim()) {
        throw new AppError("Book ID parameter is required", 400, "INVALID_ID");
    }
    if (id.length === 24 && !isValidObjectId(id)) {
        throw new AppError("Malformed ObjectId parameter", 400, "INVALID_ID");
    }
    const db = getDb();
    const booksCollection = db.collection("books");
    const book = await booksCollection.findOne(getBookQuery(id));
    if (!book || book.isDeleted === true) {
        throw new AppError(`Book with identifier "${id}" not found in catalog`, 404, "NOT_FOUND");
    }
    return sendSuccess(res, {
        statusCode: 200,
        message: "Book details retrieved successfully",
        data: book,
        extra: {
            book,
        },
    });
}));
export default router;
