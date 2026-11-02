import { Router } from "express";
import { getDb, getClient } from "../config/db.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";
import { isValidObjectId } from "../utils/idHelper.js";
import { updateBook, returnBook } from "../services/inventoryService.js";

const router = Router();

// বই আপডেটের ডাটা প্রসেস করার হেল্পার
function parseBookUpdateBody(body) {
  if (!body || typeof body !== "object") {
    throw new AppError("Request body must be a valid JSON object", 400, "VALIDATION_ERROR");
  }

  const patch = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) {
      throw new AppError("Book title cannot be empty", 400, "VALIDATION_ERROR");
    }
    patch.title = title;
  }

  if (body.author !== undefined) {
    patch.author = String(body.author).trim() || "Unknown Author";
  }

  if (body.category !== undefined) {
    patch.category = String(body.category).trim() || "Fiction";
  }

  if (body.totalCopies !== undefined || body.copies !== undefined) {
    const val = Number(body.totalCopies !== undefined ? body.totalCopies : body.copies);
    if (isNaN(val) || !Number.isInteger(val) || val < 1) {
      throw new AppError("totalCopies must be a positive integer greater than or equal to 1", 400, "VALIDATION_ERROR");
    }
    patch.totalCopies = val;
    patch.copies = val;
  }

  if (body.availableCopies !== undefined) {
    const val = Number(body.availableCopies);
    if (isNaN(val) || !Number.isInteger(val) || val < 0) {
      throw new AppError("availableCopies cannot be negative", 400, "VALIDATION_ERROR");
    }
    patch.availableCopies = val;
    patch.available = val > 0;
    patch.status = val > 0 ? "Available" : "Unavailable";
  }

  if (body.image !== undefined) {
    patch.image = String(body.image).trim();
  }

  if (body.rating !== undefined) {
    const rating = Number(body.rating);
    if (isNaN(rating) || rating < 0 || rating > 5) {
      throw new AppError("Rating must be a numeric value between 0 and 5", 400, "VALIDATION_ERROR");
    }
    patch.rating = rating;
  }

  if (body.description !== undefined) {
    patch.description = String(body.description).trim();
  }

  delete patch._id;
  delete patch.ownerUserId;
  delete patch.isDeleted;
  delete patch.createdAt;

  return patch;
}

// =============================================================================
// ১. বই আপডেট করা (PATCH /books/:id)
// =============================================================================
router.patch(
  "/books/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id || typeof id !== "string" || !id.trim()) {
      throw new AppError("Book ID parameter is required", 400, "INVALID_ID");
    }
    if (id.length === 24 && !isValidObjectId(id)) {
      throw new AppError("Malformed ObjectId parameter", 400, "INVALID_ID");
    }

    const updateData = parseBookUpdateBody(req.body);
    const db = getDb();

    const result = await updateBook({
      db,
      user: req.user,
      bookId: id,
      updateData,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Book updated successfully",
      data: result,
    });
  })
);

// =============================================================================
// ২. বই আপডেট করা (PUT /books/:id - ব্যাকওয়ার্ড কম্প্যাটিবিলিটি)
// =============================================================================
router.put(
  "/books/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id || typeof id !== "string" || !id.trim()) {
      throw new AppError("Book ID parameter is required", 400, "INVALID_ID");
    }
    if (id.length === 24 && !isValidObjectId(id)) {
      throw new AppError("Malformed ObjectId parameter", 400, "INVALID_ID");
    }

    const updateData = parseBookUpdateBody(req.body);
    const db = getDb();

    const result = await updateBook({
      db,
      user: req.user,
      bookId: id,
      updateData,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Book updated successfully",
      data: result,
    });
  })
);

// =============================================================================
// ৩. ধার করা বই ফেরত দেওয়া (PUT /borrows/:id/return)
// =============================================================================
router.put(
  "/borrows/:id/return",
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id || typeof id !== "string" || !id.trim()) {
      throw new AppError("Borrow ID parameter is required", 400, "INVALID_ID");
    }
    if (id.length === 24 && !isValidObjectId(id)) {
      throw new AppError("Malformed ObjectId parameter", 400, "INVALID_ID");
    }

    const db = getDb();
    const client = getClient();

    const result = await returnBook({
      client,
      db,
      user: req.user,
      borrowId: id,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Book returned successfully. Inventory updated.",
      data: result,
      extra: result,
    });
  })
);

export default router;

