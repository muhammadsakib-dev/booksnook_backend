import { Router } from "express";
import { getDb } from "../config/db.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";
import { isValidObjectId, getBookQuery } from "../utils/idHelper.js";
import { reconcileInventory } from "../services/inventoryService.js";

const router = Router();

// =============================================================================
// ১. বেসিক হেলথ চেক (GET / এবং GET /health)
// =============================================================================
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

// =============================================================================
// ২. বইয়ের তালিকা দেখা (GET /books) - সার্চ, ফিল্টারিং, সর্টিং এবং পেজিনেশন সহ
// =============================================================================
router.get(
  "/books",
  asyncHandler(async (req, res) => {
    const db = getDb();
    const booksCollection = db.collection("books");
    const { search, category, sort, page, limit, ownerUserId } = req.query;

    const filter = { isDeleted: { $ne: true } };

    // নির্দিষ্ট ইউজারের যোগ করা বই ফিল্টার
    if (ownerUserId) {
      filter.ownerUserId = String(ownerUserId);
    }

    // ক্যাটাগরি ফিল্টার
    if (category && category !== "All") {
      filter.category = category;
    }

    // টাইটেল বা লেখকের নামে সার্চ
    if (search && typeof search === "string" && search.trim()) {
      const cleanSearch = search.trim();
      const searchRegex = new RegExp(cleanSearch, "i");
      filter.$or = [{ title: searchRegex }, { author: searchRegex }];
    }

    // সর্টিং অপশন
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

    // পেজিনেশন হ্যান্ডলিং
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

// =============================================================================
// ৩. একটি নির্দিষ্ট বইয়ের বিস্তারিত তথ্য দেখা (GET /books/:id)
// =============================================================================
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

// =============================================================================
// ৪. ইউজারের নিজের ধার করা বইয়ের লিস্ট দেখা (GET /borrows)
// =============================================================================
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

    const borrows = await borrowsCollection
      .find(query)
      .sort({ borrowedAt: -1, createdAt: -1 })
      .toArray();

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

// =============================================================================
// ৫. ইনভেন্টরি রিকনসিলিয়েশন অডিট (GET /inventory/reconcile)
// =============================================================================
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

