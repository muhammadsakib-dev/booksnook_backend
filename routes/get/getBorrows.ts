import { Router, Request, Response } from "express";
import { getDb } from "../../config/db.js";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { getBookQuery } from "../../utils/idHelper.js";

const router = Router();

// Get logged-in user's borrow records
router.get(
  "/borrows",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const borrowsCollection = db.collection("borrows");

    const query: Record<string, any> = { userId: req.user.id };
    if (req.query.status && req.query.status !== "all") {
      query.status = req.query.status;
    }

    const booksCollection = db.collection("books");
    const borrows = await borrowsCollection
      .find(query)
      .sort({ borrowedAt: -1, createdAt: -1 })
      .toArray();

    // Ensure bookImage is available
    for (const b of borrows) {
      if (!b.bookImage || b.bookImage.trim() === "") {
        const book = await booksCollection.findOne(getBookQuery(b.bookId));
        if (book) {
          b.bookImage = book.image || "";
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

export default router;

