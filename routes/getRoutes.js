import { Router } from "express";
import { getDb } from "../config/db.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";
import { isValidObjectId, getBookQuery } from "../utils/idHelper.js";
import { reconcileInventory } from "../services/inventoryService.js";

const router = Router();

// Health check endpoints
router.get("/", (req, res) => {
  return sendSuccess(res, {
    message: "BookNook Backend Service is Running!",
    data: {
      version: "1.0.0",
      status: "healthy",
      service: "BookNook API",
    },
  });
});

router.get("/health", (req, res) => {
  return sendSuccess(res, {
    message: "Server health status",
    data: {
      status: "healthy",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

// Get books catalog (GET /books)
router.get(
  "/books",
  asyncHandler(async (req, res) => {
    const db = getDb();
    const booksCollection = db.collection("books");
    const { search, category, sort, page, limit, ownerUserId } = req.query;

    const filter = { isDeleted: { $ne: true } };

    // Filter by owner
    if (ownerUserId) {
      filter.ownerUserId = String(ownerUserId);
    }

    // Filter by category
    if (category && category !== "All") {
      filter.category = category;
    }

    // Search by title or author
    if (search && typeof search === "string" && search.trim()) {
      const cleanSearch = search.trim();
      const searchRegex = new RegExp(cleanSearch, "i");
      filter.$or = [{ title: searchRegex }, { author: searchRegex }];
    }

    // Sort options
    let sortOptions = { createdAt: -1 };
    if (sort === "copies-desc") {
      sortOptions = { availableCopies: -1 };
    } else if (sort === "rating") {
      sortOptions = { rating: -1 };
    } else if (sort === "title-asc") {
      sortOptions = { title: 1 };
    } else if (sort === "newest") {
      sortOptions = { createdAt: -1 };
    }

    // Pagination
    const isPaginated = page !== undefined || limit !== undefined;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 12));

    let cursor = booksCollection.find(filter).sort(sortOptions);

    if (isPaginated) {
      const total = await booksCollection.countDocuments(filter);
      const skip = (pageNum - 1) * limitNum;
      const books = await cursor.skip(skip).limit(limitNum).toArray();

      return sendSuccess(res, {
        statusCode: 200,
        message: "Books catalog retrieved successfully",
        data: books,
        extra: {
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
          books,
        },
      });
    }

    const books = await cursor.toArray();
    return sendSuccess(res, {
      statusCode: 200,
      message: "Books catalog retrieved successfully",
      data: books,
      extra: {
        books,
      },
    });
  })
);

// Get single book details (GET /books/:id)
router.get(
  "/books/:id",
  asyncHandler(async (req, res) => {
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
  })
);

// Get user borrow records (GET /borrows)
router.get(
  "/borrows",
  authenticate,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const borrowsCollection = db.collection("borrows");

    const query = { userId: req.user.id };
    if (req.query.status && req.query.status !== "all") {
      query.status = req.query.status;
    }

    const booksCollection = db.collection("books");
    const borrows = await borrowsCollection
      .find(query)
      .sort({ borrowedAt: -1, createdAt: -1 })
      .toArray();

    // Populate book cover image if missing
    for (const b of borrows) {
      if (!b.bookImage || b.bookImage.trim() === "") {
        const book = await booksCollection.findOne(getBookQuery(b.bookId));
        if (book) {
          b.bookImage =
            book.imageUrl ||
            book.image ||
            book.coverImage ||
            book.cover_image ||
            "";
        }
      }
    }

    return sendSuccess(res, {
      statusCode: 200,
      message: "Borrow records retrieved successfully",
      data: borrows,
      extra: {
        borrows,
      },
    });
  })
);

// Inventory reconciliation audit (GET /inventory/reconcile)
router.get(
  "/inventory/reconcile",
  authenticate,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const report = await reconcileInventory({ db });
    return sendSuccess(res, {
      message: "Inventory reconciliation audit complete",
      data: report,
      extra: { report },
    });
  })
);

export default router;

