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

  const createdBorrows = [];

  for (const item of items) {
    const bookId = String(item.bookId);
    const quantity = Math.max(1, Number(item.quantity || 1));

    // 1. Check for duplicate pending or active loan
    const existingActive = await borrowsColl.findOne({
      userId: user.id,
      bookId,
      status: { $in: ["Active", "Pending", "Return Pending"] },
    });

    if (existingActive) {
      const msg =
        existingActive.status === "Pending"
          ? `You already have a pending borrow request for "${existingActive.bookTitle || "this book"}". Please wait for owner approval.`
          : `You already hold an active copy of "${existingActive.bookTitle || "this book"}". Return it before borrowing again.`;
      throw new AppError(msg, 400, "DUPLICATE_ACTIVE_LOAN");
    }

    // 2. Fetch book details
    const bookQuery = getBookQuery(bookId);
    const book = await booksColl.findOne(bookQuery);

    if (!book || book.isDeleted === true) {
      throw new AppError("Book not found or has been removed from catalog.", 404, "NOT_FOUND");
    }

    // Disallow self-borrowing
    if (book.ownerUserId && String(book.ownerUserId) === String(user.id)) {
      throw new AppError(
        `You are the contributor of "${book.title}". You cannot borrow your own book.`,
        400,
        "CANNOT_BORROW_OWN_BOOK"
      );
    }

    if ((book.availableCopies ?? 0) < quantity) {
      throw new AppError(
        `Only ${book.availableCopies ?? 0} copy(ies) available for "${book.title}". Requested: ${quantity}.`,
        400,
        "INSUFFICIENT_COPIES"
      );
    }

    // 3. Atomically decrement availableCopies to reserve copy
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

    const now = new Date().toISOString();

    // 4. Create Borrow Request Document with Pending status
    const borrowDoc = {
      bookId,
      bookTitle: book.title || "Untitled Book",
      bookAuthor: book.author || "Unknown Author",
      bookImage: book.image || "",
      quantity,
      userId: user.id,
      userEmail: user.email || "",
      userName: user.name || "",
      ownerUserId: book.ownerUserId || "system",
      ownerName: book.addedByName || "BookNook Central Library",
      ownerEmail: book.addedByEmail || "contact@booknook.lib",
      status: "Pending",
      requestedAt: now,
      borrowDate: null,
      borrowedAt: null,
      dueDate: null,
      returnDate: null,
      returnRequestedAt: null,
      returnedAt: null,
      createdAt: now,
      updatedAt: now,
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
 * Service 2.1: Approve Borrow Request (Book Contributor / Librarian)
 */
export async function approveBorrowRequest({
  db,
  user,
  borrowId,
}: {
  db: Db;
  user: InventoryUser;
  borrowId: string;
}) {
  if (!user || !user.id) {
    throw new AppError("User authentication required", 401, "UNAUTHORIZED");
  }

  const borrowsColl = db.collection("borrows");
  const query = getBorrowQuery(borrowId);
  const borrow = await borrowsColl.findOne(query);

  if (!borrow) {
    throw new AppError("Borrow request not found", 404, "NOT_FOUND");
  }

  const isOwner =
    !borrow.ownerUserId ||
    borrow.ownerUserId === "system" ||
    String(borrow.ownerUserId) === String(user.id);
  const isLibrarian = user.role === "librarian";

  if (!isOwner && !isLibrarian) {
    throw new AppError(
      "Only the book contributor can approve this borrow request",
      403,
      "FORBIDDEN"
    );
  }

  if (borrow.status !== "Pending") {
    throw new AppError(
      `Cannot approve borrow request with current status "${borrow.status}"`,
      400,
      "INVALID_STATUS"
    );
  }

  const now = new Date();
  const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days from approval

  await borrowsColl.updateOne(query, {
    $set: {
      status: "Active",
      borrowDate: now.toISOString(),
      borrowedAt: now.toISOString(),
      dueDate: dueDate.toISOString(),
      returnDate: dueDate.toISOString(),
      approvedAt: now.toISOString(),
      approvedByUserId: user.id,
      updatedAt: now.toISOString(),
    },
  });

  return {
    borrowId: borrow._id,
    status: "Active",
    borrowedAt: now.toISOString(),
    dueDate: dueDate.toISOString(),
  };
}

/**
 * Service 2.2: Reject Borrow Request (Contributor declines or Borrower cancels)
 */
export async function rejectBorrowRequest({
  db,
  user,
  borrowId,
  reason,
}: {
  db: Db;
  user: InventoryUser;
  borrowId: string;
  reason?: string;
}) {
  if (!user || !user.id) {
    throw new AppError("User authentication required", 401, "UNAUTHORIZED");
  }

  const booksColl = db.collection("books");
  const borrowsColl = db.collection("borrows");
  const query = getBorrowQuery(borrowId);
  const borrow = await borrowsColl.findOne(query);

  if (!borrow) {
    throw new AppError("Borrow request not found", 404, "NOT_FOUND");
  }

  const isOwner =
    !borrow.ownerUserId ||
    borrow.ownerUserId === "system" ||
    String(borrow.ownerUserId) === String(user.id);
  const isBorrower = String(borrow.userId) === String(user.id);
  const isLibrarian = user.role === "librarian";

  if (!isOwner && !isBorrower && !isLibrarian) {
    throw new AppError(
      "You are not authorized to cancel or decline this request",
      403,
      "FORBIDDEN"
    );
  }

  if (borrow.status !== "Pending") {
    throw new AppError(
      `Cannot reject borrow request with status "${borrow.status}"`,
      400,
      "INVALID_STATUS"
    );
  }

  const now = new Date().toISOString();
  const resolvedStatus = isBorrower ? "Cancelled" : "Rejected";

  // 1. Update borrow status
  await borrowsColl.updateOne(query, {
    $set: {
      status: resolvedStatus,
      rejectionReason:
        reason ||
        (isBorrower
          ? "Cancelled by borrower"
          : "Declined by book contributor"),
      rejectedAt: now,
      updatedAt: now,
    },
  });

  // 2. Restore reserved copies to book inventory
  const qty = Math.max(1, Number(borrow.quantity || 1));
  await booksColl.updateOne(getBookQuery(borrow.bookId), {
    $inc: { availableCopies: qty },
    $set: { updatedAt: now },
  });

  return {
    borrowId: borrow._id,
    status: resolvedStatus,
    quantityRestored: qty,
  };
}

/**
 * Service 2.3: Request Return (Borrower initiates return)
 */
export async function requestReturn({
  db,
  user,
  borrowId,
}: {
  db: Db;
  user: InventoryUser;
  borrowId: string;
}) {
  if (!user || !user.id) {
    throw new AppError("User authentication required", 401, "UNAUTHORIZED");
  }

  const borrowsColl = db.collection("borrows");
  const query = getBorrowQuery(borrowId);
  const borrow = await borrowsColl.findOne(query);

  if (!borrow) {
    throw new AppError("Borrow record not found", 404, "NOT_FOUND");
  }

  const isBorrower = String(borrow.userId) === String(user.id);
  const isLibrarian = user.role === "librarian";

  if (!isBorrower && !isLibrarian) {
    throw new AppError(
      "You can only request return for books you borrowed",
      403,
      "FORBIDDEN"
    );
  }

  if (borrow.status !== "Active" && borrow.status !== "Overdue") {
    throw new AppError(
      `Cannot request return for book with status "${borrow.status}"`,
      400,
      "INVALID_STATUS"
    );
  }

  const now = new Date().toISOString();

  await borrowsColl.updateOne(query, {
    $set: {
      status: "Return Pending",
      returnRequestedAt: now,
      updatedAt: now,
    },
  });

  return {
    borrowId: borrow._id,
    status: "Return Pending",
    returnRequestedAt: now,
  };
}

/**
 * Service 2.4: Approve Return (Book Contributor / Librarian confirms receipt)
 */
export async function approveReturn({
  db,
  user,
  borrowId,
}: {
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

  const isOwner =
    !borrow.ownerUserId ||
    borrow.ownerUserId === "system" ||
    String(borrow.ownerUserId) === String(user.id);
  const isLibrarian = user.role === "librarian";

  if (!isOwner && !isLibrarian) {
    throw new AppError(
      "Only the book contributor can confirm receipt of this returned book",
      403,
      "FORBIDDEN"
    );
  }

  if (borrow.status === "Returned") {
    throw new AppError(
      "This book return has already been confirmed",
      400,
      "ALREADY_RETURNED"
    );
  }

  const now = new Date().toISOString();

  // 1. Mark status as Returned
  await borrowsColl.updateOne(query, {
    $set: {
      status: "Returned",
      returnedAt: now,
      returnApprovedByUserId: user.id,
      updatedAt: now,
    },
  });

  // 2. Restore available copies
  const qty = Math.max(1, Number(borrow.quantity || 1));
  await booksColl.updateOne(getBookQuery(borrow.bookId), {
    $inc: { availableCopies: qty },
    $set: { updatedAt: now },
  });

  return {
    borrowId: borrow._id,
    status: "Returned",
    returnedAt: now,
    quantityRestored: qty,
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

  // Check active or in-flight loans
  const activeLoans = await borrowsColl.countDocuments({
    bookId: String(bookId),
    status: { $in: ["Active", "Pending", "Return Pending"] },
  });

  if (activeLoans > 0) {
    throw new AppError(
      `Cannot delete book while ${activeLoans} active or pending borrow request(s) exist. Wait until all loans are returned or resolved.`,
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

    // Aggregate active and reserved borrow quantities for this book
    const activeBorrowStats = await borrowsColl
      .aggregate([
        {
          $match: {
            bookId: String(bookId),
            status: { $in: ["Active", "Pending", "Return Pending"] },
          },
        },
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

