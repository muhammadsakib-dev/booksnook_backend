import { getDb } from "../../config/db.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  getBooksCatalog,
  getSingleBook,
  createNewBook,
  updateExistingBook,
  deleteExistingBook,
} from "./books.service.js";

/**
 * GET /books — List Catalog Books with Search, Filters, Sorting, and Pagination
 */
export const getBooks = asyncHandler(async (req, res) => {
  const db = getDb();
  const { search, category, sort, page, limit, ownerUserId } = req.query;

  const result = await getBooksCatalog(db, {
    search,
    category,
    sort,
    page,
    limit,
    ownerUserId,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "Books catalog retrieved successfully",
    data: result.books,
    extra: {
      ...(result.pagination ? { pagination: result.pagination } : {}),
      // Also provide top-level array alias for direct legacy unpackers
      books: result.books,
    },
  });
});

/**
 * GET /books/:id — Single Book Details
 */
export const getBookById = asyncHandler(async (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const book = await getSingleBook(db, id);

  return sendSuccess(res, {
    statusCode: 200,
    message: "Book details retrieved successfully",
    data: book,
    extra: {
      book, // legacy alias
    },
  });
});

/**
 * POST /books — Register New Book (Authenticated)
 */
export const createBook = asyncHandler(async (req, res) => {
  const db = getDb();
  const book = await createNewBook(db, req.user, req.validatedBook);

  return sendSuccess(res, {
    statusCode: 201,
    message: "Book added successfully to library catalog",
    data: book,
    extra: {
      insertedId: book._id,
      book, // legacy alias
    },
  });
});

/**
 * PATCH & PUT /books/:id — Update Book (Authenticated & Ownership Verified)
 */
export const updateBookHandler = asyncHandler(async (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const result = await updateExistingBook(db, req.user, id, req.validatedUpdate);

  return sendSuccess(res, {
    statusCode: 200,
    message: "Book updated successfully",
    data: result,
  });
});

/**
 * DELETE /books/:id — Soft-Delete Book (Authenticated & Ownership Verified)
 */
export const deleteBookHandler = asyncHandler(async (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const result = await deleteExistingBook(db, req.user, id);

  return sendSuccess(res, {
    statusCode: 200,
    message: "Book successfully deleted from library",
    data: result,
  });
});

