import { Router } from "express";
import { getDb, getClient } from "../config/db.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";
import { isValidObjectId } from "../utils/idHelper.js";
import { borrowBooks } from "../services/inventoryService.js";

const router = Router();

// Add book (POST /books)
router.post(
  "/books",
  authenticate,
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object") {
      throw new AppError("Request body must be a valid JSON object", 400, "VALIDATION_ERROR");
    }

    const title = (body.title || body.bookTitle || body.name || "").trim();
    if (!title) {
      throw new AppError("Book title is required", 400, "VALIDATION_ERROR");
    }
    if (title.length > 250) {
      throw new AppError("Book title cannot exceed 250 characters", 400, "VALIDATION_ERROR");
    }

    const author = (body.author || body.authorName || "Unknown Author").trim();
    const category = (body.category || body.genre || "Fiction").trim();
    const rawCopies = body.copies ?? body.totalCopies ?? body.quantity ?? 1;
    const totalCopies = Number(rawCopies);

    if (isNaN(totalCopies) || !Number.isInteger(totalCopies) || totalCopies < 1) {
      throw new AppError("totalCopies must be a positive integer greater than or equal to 1", 400, "VALIDATION_ERROR");
    }

    const image = body.image || body.coverImage || body.imageUrl;
    if (body.rating !== undefined) {
      const rating = Number(body.rating);
      if (isNaN(rating) || rating < 0 || rating > 5) {
        throw new AppError("Rating must be a numeric value between 0 and 5", 400, "VALIDATION_ERROR");
      }
    }

    const db = getDb();
    const booksCollection = db.collection("books");
    const now = new Date().toISOString();

    const newBook = {
      title,
      author,
      image: image || "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=800",
      category,
      rating: body.rating !== undefined ? Number(body.rating) : 4.8,
      totalCopies,
      availableCopies: totalCopies,
      copies: totalCopies,
      available: true,
      status: "Available",
      description: typeof body.description === "string" ? body.description.trim() : "",
      isDeleted: false,
      ownerUserId: req.user.id,
      addedByName: req.user.name,
      addedByEmail: req.user.email,
      createdAt: now,
      updatedAt: now,
    };

    const result = await booksCollection.insertOne(newBook);
    const createdBook = {
      _id: result.insertedId,
      ...newBook,
    };

    return sendSuccess(res, {
      statusCode: 201,
      message: "Book added successfully to library catalog",
      data: createdBook,
      extra: {
        insertedId: createdBook._id,
        book: createdBook,
      },
    });
  })
);

// Borrow books (POST /borrows)
router.post(
  "/borrows",
  authenticate,
  asyncHandler(async (req, res) => {
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
  })
);

export default router;

