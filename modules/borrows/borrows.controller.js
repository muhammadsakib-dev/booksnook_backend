import { getClient, getDb } from "../../config/db.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  getReaderBorrows,
  checkoutBooks,
  returnBookLoan,
} from "./borrows.service.js";

/**
 * GET /borrows — List Reader's Own Loans (Authenticated)
 */
export const getBorrows = asyncHandler(async (req, res) => {
  const db = getDb();
  const borrows = await getReaderBorrows(db, req.user, {
    status: req.query.status,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "Borrow records retrieved successfully",
    data: borrows,
    extra: {
      borrows, // legacy alias
    },
  });
});

/**
 * POST /borrows — Create Borrow Loan (Single or Multi-item Batch)
 */
export const createBorrow = asyncHandler(async (req, res) => {
  const client = getClient();
  const db = getDb();

  const createdBorrows = await checkoutBooks(
    client,
    db,
    req.user,
    req.validatedBorrowItems
  );

  const count = createdBorrows.length;
  const message = `Borrow confirmed for ${count} ${count === 1 ? "book" : "books"}`;

  return sendSuccess(res, {
    statusCode: 201,
    message,
    data: createdBorrows,
    extra: {
      borrow: createdBorrows[0], // legacy alias
      borrows: createdBorrows,   // legacy alias
    },
  });
});

/**
 * DELETE /borrows/:id & PUT /borrows/:id/return — Return Book Loan
 */
export const returnBorrow = asyncHandler(async (req, res) => {
  const client = getClient();
  const db = getDb();
  const { id } = req.params;

  const result = await returnBookLoan(client, db, req.user, id);

  return sendSuccess(res, {
    statusCode: 200,
    message: "Book returned successfully. Inventory updated.",
    data: result,
    extra: result, // legacy alias
  });
});

