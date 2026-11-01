import { getBookQuery } from "../../utils/idHelper.js";
import { AppError } from "../../utils/AppError.js";
import { updateBook, deleteBook } from "../../services/inventoryService.js";

/**
 * Service: Query Book Catalog with Search, Filters, Sorting & Optional Pagination
 */
export async function getBooksCatalog(db, { search, category, sort, page, limit, ownerUserId }) {
  const booksCollection = db.collection("books");
  const filter = { isDeleted: { $ne: true } };

  if (ownerUserId) {
    filter.ownerUserId = String(ownerUserId);
  }

  if (category && category !== "All") {
    filter.category = category;
  }

  if (search && typeof search === "string" && search.trim()) {
    const cleanSearch = search.trim();
    const searchRegex = new RegExp(cleanSearch, "i");
    filter.$or = [{ title: searchRegex }, { author: searchRegex }];
  }

  // Sorting
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

  // Optional Pagination
  const isPaginated = page !== undefined || limit !== undefined;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 12));

  let cursor = booksCollection.find(filter).sort(sortOptions);

  if (isPaginated) {
    const total = await booksCollection.countDocuments(filter);
    const skip = (pageNum - 1) * limitNum;
    const books = await cursor.skip(skip).limit(limitNum).toArray();

    return {
      books,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  // Non-paginated (backwards-compatible: returns complete catalog)
  const books = await cursor.toArray();
  return { books, pagination: null };
}

/**
 * Service: Fetch Single Book by ID
 */
export async function getSingleBook(db, id) {
  const booksCollection = db.collection("books");
  const book = await booksCollection.findOne(getBookQuery(id));

  if (!book || book.isDeleted === true) {
    throw new AppError(`Book with identifier "${id}" not found in catalog`, 404, "NOT_FOUND");
  }

  return book;
}

/**
 * Service: Register New Book with Injected User Context
 */
export async function createNewBook(db, user, validatedBook) {
  const booksCollection = db.collection("books");
  const now = new Date().toISOString();

  const newBook = {
    title: validatedBook.title,
    author: validatedBook.author,
    image: validatedBook.image,
    category: validatedBook.category,
    rating: validatedBook.rating,
    totalCopies: validatedBook.totalCopies,
    availableCopies: validatedBook.totalCopies, // availableCopies initialized = totalCopies
    copies: validatedBook.totalCopies,
    available: true,
    status: "Available",
    description: validatedBook.description,
    isDeleted: false,
    ownerUserId: user.id,
    addedByName: user.name,
    addedByEmail: user.email,
    createdAt: now,
    updatedAt: now,
  };

  const result = await booksCollection.insertOne(newBook);
  return {
    _id: result.insertedId,
    ...newBook,
  };
}

/**
 * Service: Update Existing Book (Enforces Ownership & Active Loan Lower Bound)
 */
export async function updateExistingBook(db, user, bookId, updateData) {
  return await updateBook({
    db,
    user,
    bookId,
    updateData,
  });
}

/**
 * Service: Soft-Delete Book (Enforces Ownership & Active Loan Guard)
 */
export async function deleteExistingBook(db, user, bookId) {
  return await deleteBook({
    db,
    user,
    bookId,
  });
}

