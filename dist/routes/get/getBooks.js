import { Router } from "express";
import { getDb } from "../../config/db.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
const router = Router();
// Get books catalog with search, filter, sort, and pagination
router.get("/books", asyncHandler(async (req, res) => {
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
        const escapedSearch = cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const searchRegex = new RegExp(escapedSearch, "i");
        filter.$or = [{ title: searchRegex }, { author: searchRegex }];
    }
    // Sort options
    let sortOptions = { createdAt: -1 };
    if (sort === "copies-desc" || sort === "available") {
        sortOptions = { availableCopies: -1, createdAt: -1 };
    }
    else if (sort === "rating") {
        sortOptions = { rating: -1, createdAt: -1 };
    }
    else if (sort === "title-asc") {
        sortOptions = { title: 1 };
    }
    // Pagination
    const isPaginated = page !== undefined || limit !== undefined;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 12));
    const cursor = booksCollection.find(filter).sort(sortOptions);
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
            },
        });
    }
    const books = await cursor.toArray();
    return sendSuccess(res, {
        statusCode: 200,
        message: "Books catalog retrieved successfully",
        data: books,
    });
}));
export default router;
