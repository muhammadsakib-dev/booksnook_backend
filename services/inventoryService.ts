import { Db } from "mongodb";
import { getBookQuery, getBorrowQuery } from "../utils/idHelper.js";
import { AppError } from "../utils/AppError.js";

export { getBookQuery, getBorrowQuery };

export interface BorrowItem {
  bookId: string;
  quantity?: number;
}

export interface InventoryUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
}

/**
 * Service 1: Borrow Books (Single or Multi-item Batch)
 */
export async function borrowBooks({
  db,
  user,
  items,
}: {
  client?: any;
  db: Db;
  user: InventoryUser;
  items: BorrowItem[];
}) {
  if (!user || !user.id) {
    throw new AppError("User authentication required", 401, "UNAUTHORIZED");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("No items provided for borrowing", 400, "VALIDATION_ERROR");
  }

  const booksColl = db.collection("books");
  const borrowsColl = db.collection("borrows");

  const borrowDate = new Date();
  const dueDate = new Date(borrowDate.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days loan period
  const createdBorrows = [];

  for (const item of items) {
    const bookId = String(item.bookId);
    const quantity = Math.max(1, Number(item.quantity || 1));

    // 1. Check for duplicate active loan
    const existingActive = await borrowsColl.findOne({
      userId: user.id,
      bookId,
      status: "Active",
    });

    if (existingActive) {
      throw new AppError(
        `You already hold an active copy of "${existingActive.bookTitle || "this book"}". Return it before borrowing again.`,
        400,
        "DUPLICATE_ACTIVE_LOAN"
      );
    }

    // 2. Fetch book details
    const bookQuery = getBookQuery(bookId);
    const book = await booksColl.findOne(bookQuery);

    if (!book || book.isDeleted === true) {
      throw new AppError("Book not found or has been removed from catalog.", 404, "NOT_FOUND");
    }

    if ((book.availableCopies ?? 0) < quantity) {
      throw new AppError(
        `Only ${book.availableCopies ?? 0} copy(ies) available for "${book.title}". Requested: ${quantity}.`,
        400,
        "INSUFFICIENT_COPIES"
      );
    }

    // 3. Atomically decrement availableCopies
    const updateRes = await booksColl.updateOne(
      {
        ...bookQuery,
        isDeleted: { $ne: true },
        availableCopies: { $gte: quantity },
      },
      {
        $inc: { availableCopies: -quantity },
        $set: { updatedAt: new Date().toISOString() },
      }
    );

    if (updateRes.modifiedCount === 0) {
      throw new AppError(
        `Copies for "${book.title}" were claimed by another reader. Please try again.`,
        400,
        "INSUFFICIENT_COPIES"
      );
    }

    // 4. Create Borrow Document
    const borrowDoc = {
      bookId,
      bookTitle: book.title || "Untitled Book",
      bookAuthor: book.author || "Unknown Author",
      bookImage: book.image || "",
      quantity,
      userId: user.id,
      userEmail: user.email || "",
      userName: user.name || "",
      borrowDate: borrowDate.toISOString(),
      borrowedAt: borrowDate.toISOString(),
      dueDate: dueDate.toISOString(),
      returnDate: dueDate.toISOString(),
      status: "Active",
      returnedAt: null,
      createdAt: new Date().toISOString(),
    };

    const insertRes = await borrowsColl.insertOne(borrowDoc);
    createdBorrows.push({ _id: insertRes.insertedId, ...borrowDoc });
  }

  return createdBorrows;
}

/**
 * Service 2: Return Borrowed Book
 */
export async function returnBook({
  db,
  user,
  borrowId,
}: {
  client?: any;
  db: Db;
  user: InventoryUser;
  borrowId: string;
}) {
  if (!user || !user.id) {
    throw new AppError("User authentication required", 401, "UNAUTHORIZED");
  }

  const booksColl = db.collection("books");
  const borrowsColl = db.collection("borrows");
  const query = getBorrowQuery(borrowId);

  const borrow = await borrowsColl.findOne(query);
  if (!borrow) {
    throw new AppError("Borrow record not found", 404, "NOT_FOUND");
  }

  // Ownership check: borrower or librarian
  const isBorrower = String(borrow.userId) === String(user.id);
  const isLibrarian = user.role === "librarian";

  if (!isBorrower && !isLibrarian) {
    throw new AppError("You can return only your own borrowed books", 403, "FORBIDDEN");
  }

  if (borrow.status === "Returned") {
    throw new AppError("This book loan has already been returned", 400, "ALREADY_RETURNED");
  }

  const returnTimestamp = new Date().toISOString();

  // 1. Update status to Returned
  const updateBorrowRes = await borrowsColl.updateOne(
    { ...query, status: { $ne: "Returned" } },
    {
      $set: {
        status: "Returned",
        returnedAt: returnTimestamp,
      },
    }
  );

  if (updateBorrowRes.modifiedCount === 0) {
    throw new AppError("Book return already recorded", 400, "ALREADY_RETURNED");
  }

  // 2. Restore copies to book inventory
  const quantityToRestore = Math.max(1, Number(borrow.quantity || 1));
  await booksColl.updateOne(getBookQuery(borrow.bookId), {
    $inc: { availableCopies: quantityToRestore },
    $set: { updatedAt: returnTimestamp },
  });

  return {
    borrowId: borrow._id,
    returnedAt: returnTimestamp,
    quantityRestored: quantityToRestore,
  };
}

/**
 * Service 3: Soft-Delete Book
 */
export async function deleteBook({
  db,
  user,
  bookId,
}: {
  db: Db;
  user: InventoryUser;
  bookId: string;
}) {
  const booksColl = db.collection("books");
  const borrowsColl = db.collection("borrows");

  const query = getBookQuery(bookId);
  const book = await booksColl.findOne(query);

  if (!book || book.isDeleted === true) {
    throw new AppError("Book not found", 404, "NOT_FOUND");
  }

  // Ownership check
  const isOwner =
    !book.ownerUserId ||
    book.ownerUserId === "system-seed" ||
    String(book.ownerUserId) === String(user.id);
  const isLibrarian = user.role === "librarian";

  if (!isOwner && !isLibrarian) {
    throw new AppError("You can delete only your own contributed books", 403, "FORBIDDEN");
  }

  // Check active loans
  const activeLoans = await borrowsColl.countDocuments({
    bookId: String(bookId),
    status: "Active",
  });

  if (activeLoans > 0) {
    throw new AppError(
      `Cannot delete book while ${activeLoans} active borrow loan(s) exist. Wait until all copies are returned.`,
      400,
      "CANNOT_DELETE_ACTIVE_LOANS"
    );
  }

  // Soft delete
  await booksColl.updateOne(query, {
    $set: {
      isDeleted: true,
      updatedAt: new Date().toISOString(),
    },
  });

  return { bookId: book._id, isDeleted: true };
}

/**
 * Service 4: Update Book with Inventory Lower-Bound Guard
 */
export async function updateBook({
  db,
  user,
  bookId,
  updateData,
}: {
  db: Db;
  user: InventoryUser;
  bookId: string;
  updateData: Record<string, any>;
}) {
  const booksColl = db.collection("books");
  const borrowsColl = db.collection("borrows");

  const query = getBookQuery(bookId);
  const book = await booksColl.findOne(query);

  if (!book || book.isDeleted === true) {
    throw new AppError("Book not found", 404, "NOT_FOUND");
  }

  // Ownership check
  const isOwner =
    !book.ownerUserId ||
    book.ownerUserId === "system-seed" ||
    String(book.ownerUserId) === String(user.id);
  const isLibrarian = user.role === "librarian";

  if (!isOwner && !isLibrarian) {
    throw new AppError("You can update only your own contributed books", 403, "FORBIDDEN");
  }

  const patch = { ...updateData };
  delete patch._id;
  patch.updatedAt = new Date().toISOString();

  // Inventory Lower-Bound Guard
  if (patch.totalCopies !== undefined || patch.copies !== undefined) {
    const newTotal = Number(patch.totalCopies ?? patch.copies);
    if (newTotal < 1) {
      throw new AppError("Total copies must be at least 1", 400, "VALIDATION_ERROR");
    }

    // Aggregate active borrow quantities for this book
    const activeBorrowStats = await borrowsColl
      .aggregate([
        { $match: { bookId: String(bookId), status: "Active" } },
        { $group: { _id: null, totalBorrowed: { $sum: "$quantity" } } },
      ])
      .toArray();

    const currentLoanedCount = activeBorrowStats[0]?.totalBorrowed || 0;

    if (newTotal < currentLoanedCount) {
      throw new AppError(
        `Total copies cannot be reduced below ${currentLoanedCount} (currently borrowed by readers).`,
        400,
        "INVALID_INVENTORY_BOUNDARY"
      );
    }

    patch.totalCopies = newTotal;
    patch.copies = newTotal;
    patch.availableCopies = Math.max(0, newTotal - currentLoanedCount);
  }

  await booksColl.updateOne(query, { $set: patch });
  return { bookId: book._id, updated: true };
}

