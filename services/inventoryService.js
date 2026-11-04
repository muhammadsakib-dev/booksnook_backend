import { ObjectId } from "mongodb";
import { getBookQuery, getBorrowQuery } from "../utils/idHelper.js";

export { getBookQuery, getBorrowQuery };

/**
 * Transaction or compensation helper
 */
async function withTransactionOrCompensation(client, fn) {
  let session = null;
  let supportsTx = false;

  if (client && typeof client.startSession === "function") {
    try {
      session = client.startSession();
      supportsTx = true;
      let result;
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result;
    } catch (err) {
      if (
        err.message?.includes("standalone") ||
        err.message?.includes("Transaction") ||
        err.codeName === "IllegalOperation"
      ) {
        supportsTx = false;
      } else {
        throw err;
      }
    } finally {
      if (session) {
        await session.endSession().catch(() => {});
      }
    }
  }

  // Fallback to direct execution
  return await fn(null);
}

/**
 * Service 1: Borrow Books (Single or Multi-item Batch)
 * Enforces:
 * - Verified user identity
 * - Duplicate active borrow check per title
 * - Conditional atomic decrement (availableCopies >= requestedQuantity)
 * - All-or-nothing transactional guarantees (no partial checkout)
 * - 14-day loan period
 */
export async function borrowBooks({ client, db, user, items }) {
  if (!user || !user.id) {
    const error = new Error("User authentication required");
    error.code = "UNAUTHORIZED";
    error.status = 401;
    throw error;
  }

  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error("No items provided for borrowing");
    error.code = "VALIDATION_ERROR";
    error.status = 400;
    throw error;
  }

  const booksColl = db.collection("books");
  const borrowsColl = db.collection("borrows");

  const borrowDate = new Date();
  const dueDate = new Date(borrowDate.getTime() + 14 * 24 * 60 * 60 * 1000); // exactly 14 calendar days

  return await withTransactionOrCompensation(client, async (session) => {
    const sessionOpt = session ? { session } : {};
    const createdBorrows = [];
    const decrementedBooks = []; // For compensation rollback if non-replica set

    try {
      for (const item of items) {
        const bookId = String(item.bookId);
        const quantity = Math.max(1, Number(item.quantity || 1));

        // 1. Check for duplicate active loan
        const existingActive = await borrowsColl.findOne(
          {
            userId: user.id,
            bookId,
            status: "Active",
          },
          sessionOpt
        );

        if (existingActive) {
          const error = new Error(
            `You already hold an active copy of "${existingActive.bookTitle}". Return it before borrowing again.`
          );
          error.code = "DUPLICATE_ACTIVE_LOAN";
          error.status = 400;
          throw error;
        }

        // 2. Fetch book details for snapshot
        const bookQuery = getBookQuery(bookId);
        const book = await booksColl.findOne(bookQuery, sessionOpt);

        if (!book || book.isDeleted === true) {
          const error = new Error("Book not found or has been archived from catalog.");
          error.code = "NOT_FOUND";
          error.status = 404;
          throw error;
        }

        if ((book.availableCopies ?? 0) < quantity) {
          const error = new Error(
            `Only ${book.availableCopies ?? 0} copy(ies) available for "${book.title}". Requested: ${quantity}.`
          );
          error.code = "INSUFFICIENT_COPIES";
          error.status = 400;
          throw error;
        }

        // 3. Conditional Atomic Inventory Decrement
        const atomicFilter = {
          ...bookQuery,
          isDeleted: { $ne: true },
          availableCopies: { $gte: quantity },
        };

        const updateRes = await booksColl.updateOne(
          atomicFilter,
          {
            $inc: { availableCopies: -quantity },
            $set: { updatedAt: new Date().toISOString() },
          },
          sessionOpt
        );

        if (updateRes.modifiedCount === 0) {
          const error = new Error(
            `Copies for "${book.title}" were claimed by another reader. Please try again.`
          );
          error.code = "INSUFFICIENT_COPIES";
          error.status = 400;
          throw error;
        }

        decrementedBooks.push({ bookId, quantity });

        // 4. Create Borrow Document with immutable snapshot
        const borrowDoc = {
          bookId,
          bookTitle: book.title || book.bookTitle || "Untitled Book",
          bookAuthor: book.author || book.authorName || "Unknown Author",
          bookImage:
            book.image ||
            book.coverImage ||
            book.imageUrl ||
            book.cover_image ||
            "",
          quantity,
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          borrowDate: borrowDate.toISOString(),
          borrowedAt: borrowDate.toISOString(),
          dueDate: dueDate.toISOString(),
          returnDate: dueDate.toISOString(),
          status: "Active",
          returnedAt: null,
          createdAt: new Date().toISOString(),
        };

        const insertRes = await borrowsColl.insertOne(borrowDoc, sessionOpt);
        createdBorrows.push({ _id: insertRes.insertedId, ...borrowDoc });
      }

      return createdBorrows;
    } catch (err) {
      // If running without replica set session, manually rollback decrements and created borrow records
      if (!session) {
        if (decrementedBooks.length > 0) {
          for (const dec of decrementedBooks) {
            await booksColl
              .updateOne(getBookQuery(dec.bookId), {
                $inc: { availableCopies: dec.quantity },
              })
              .catch(() => {});
          }
        }
        if (createdBorrows.length > 0 && typeof borrowsColl.deleteOne === "function") {
          for (const cb of createdBorrows) {
            await borrowsColl
              .deleteOne(getBorrowQuery(cb._id))
              .catch(() => {});
          }
        }
      }
      throw err;
    }
  });
}

/**
 * Service 2: Return Borrowed Book
 * Enforces:
 * - Ownership verification
 * - Record must be in "Active" state (double-return prevention)
 * - Atomic status change to "Returned"
 * - Restores exact borrowed quantity back to availableCopies
 */
export async function returnBook({ client, db, user, borrowId }) {
  if (!user || !user.id) {
    const error = new Error("User authentication required");
    error.code = "UNAUTHORIZED";
    error.status = 401;
    throw error;
  }

  const booksColl = db.collection("books");
  const borrowsColl = db.collection("borrows");

  const query = getBorrowQuery(borrowId);

  return await withTransactionOrCompensation(client, async (session) => {
    const sessionOpt = session ? { session } : {};

    const borrow = await borrowsColl.findOne(query, sessionOpt);
    if (!borrow) {
      const error = new Error("Borrow record not found");
      error.code = "NOT_FOUND";
      error.status = 404;
      throw error;
    }

    // Ownership check: borrower or librarian
    const isBorrower = String(borrow.userId) === String(user.id);
    const isLibrarian = user.role === "librarian";

    if (!isBorrower && !isLibrarian) {
      const error = new Error("You can return only your own borrowed books");
      error.code = "FORBIDDEN";
      error.status = 403;
      throw error;
    }

    if (borrow.status === "Returned") {
      const error = new Error("This book loan has already been returned");
      error.code = "ALREADY_RETURNED";
      error.status = 400;
      throw error;
    }

    const returnTimestamp = new Date().toISOString();

    // 1. Conditional update to "Returned" (ensures atomic single execution)
    const updateBorrowRes = await borrowsColl.updateOne(
      { ...query, status: { $ne: "Returned" } },
      {
        $set: {
          status: "Returned",
          returnedAt: returnTimestamp,
        },
      },
      sessionOpt
    );

    if (updateBorrowRes.modifiedCount === 0) {
      const error = new Error("Book return already recorded");
      error.code = "ALREADY_RETURNED";
      error.status = 400;
      throw error;
    }

    // 2. Restore exact quantity to catalog inventory
    const quantityToRestore = Math.max(1, Number(borrow.quantity || 1));
    await booksColl.updateOne(
      getBookQuery(borrow.bookId),
      {
        $inc: { availableCopies: quantityToRestore },
        $set: { updatedAt: returnTimestamp },
      },
      sessionOpt
    );

    return {
      borrowId: borrow._id,
      returnedAt: returnTimestamp,
      quantityRestored: quantityToRestore,
    };
  });
}

/**
 * Service 3: Soft-Delete Book
 * Enforces:
 * - Ownership verification
 * - Cannot delete if active loans exist in borrows collection
 * - Sets isDeleted: true (never destroys loan relational integrity)
 */
export async function deleteBook({ db, user, bookId }) {
  const booksColl = db.collection("books");
  const borrowsColl = db.collection("borrows");

  const query = getBookQuery(bookId);
  const book = await booksColl.findOne(query);

  if (!book || book.isDeleted === true) {
    const error = new Error("Book not found");
    error.code = "NOT_FOUND";
    error.status = 404;
    throw error;
  }

  // Ownership check
  const isOwner =
    !book.ownerUserId ||
    book.ownerUserId === "system-seed" ||
    String(book.ownerUserId) === String(user.id);
  const isLibrarian = user.role === "librarian";

  if (!isOwner && !isLibrarian) {
    const error = new Error("You can delete only your own contributed books");
    error.code = "FORBIDDEN";
    error.status = 403;
    throw error;
  }

  // Check active loans
  const activeLoans = await borrowsColl.countDocuments({
    bookId: String(bookId),
    status: "Active",
  });

  if (activeLoans > 0) {
    const error = new Error(
      `Cannot delete book while ${activeLoans} active borrow loan(s) exist. Wait until all copies are returned.`
    );
    error.code = "CANNOT_DELETE_ACTIVE_LOANS";
    error.status = 400;
    throw error;
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
 * Enforces:
 * - totalCopies cannot fall below active borrowed quantity
 */
export async function updateBook({ db, user, bookId, updateData }) {
  const booksColl = db.collection("books");
  const borrowsColl = db.collection("borrows");

  const query = getBookQuery(bookId);
  const book = await booksColl.findOne(query);

  if (!book || book.isDeleted === true) {
    const error = new Error("Book not found");
    error.code = "NOT_FOUND";
    error.status = 404;
    throw error;
  }

  // Ownership check
  const isOwner =
    !book.ownerUserId ||
    book.ownerUserId === "system-seed" ||
    String(book.ownerUserId) === String(user.id);
  const isLibrarian = user.role === "librarian";

  if (!isOwner && !isLibrarian) {
    const error = new Error("You can update only your own contributed books");
    error.code = "FORBIDDEN";
    error.status = 403;
    throw error;
  }

  const patch = { ...updateData };
  delete patch._id;
  patch.updatedAt = new Date().toISOString();

  // Inventory Lower-Bound Guard
  if (patch.totalCopies !== undefined || patch.copies !== undefined) {
    const newTotal = Number(patch.totalCopies ?? patch.copies);
    if (newTotal < 1) {
      const error = new Error("Total copies must be at least 1");
      error.code = "VALIDATION_ERROR";
      error.status = 400;
      throw error;
    }

    // Aggregate all active borrow quantities for this book
    const activeBorrowStats = await borrowsColl
      .aggregate([
        { $match: { bookId: String(bookId), status: "Active" } },
        { $group: { _id: null, totalBorrowed: { $sum: "$quantity" } } },
      ])
      .toArray();

    const currentLoanedCount = activeBorrowStats[0]?.totalBorrowed || 0;

    if (newTotal < currentLoanedCount) {
      const error = new Error(
        `Total copies cannot be reduced below ${currentLoanedCount} (currently borrowed by readers).`
      );
      error.code = "INVALID_INVENTORY_BOUNDARY";
      error.status = 400;
      throw error;
    }

    patch.totalCopies = newTotal;
    patch.copies = newTotal;
    // Maintain availableCopies = newTotal - currentLoanedCount
    patch.availableCopies = Math.max(0, newTotal - currentLoanedCount);
  }

  await booksColl.updateOne(query, { $set: patch });
  return { bookId: book._id, updated: true };
}

/**
 * Service 5: Inventory Reconciliation & Audit Report
 * Inspects every book against active borrow records.
 * Reports any inconsistencies without destructive overwriting.
 */
export async function reconcileInventory({ db }) {
  const booksColl = db.collection("books");
  const borrowsColl = db.collection("borrows");

  const allBooks = await booksColl.find({}).toArray();
  const report = {
    totalBooksAudited: allBooks.length,
    consistentCount: 0,
    discrepancyCount: 0,
    discrepancies: [],
  };

  for (const book of allBooks) {
    const bookIdStr = String(book._id);
    const activeLoans = await borrowsColl
      .aggregate([
        { $match: { bookId: bookIdStr, status: "Active" } },
        { $group: { _id: null, sumQty: { $sum: "$quantity" } } },
      ])
      .toArray();

    const borrowedQty = activeLoans[0]?.sumQty || 0;
    const total = book.totalCopies ?? book.copies ?? 5;
    const actualAvailable = book.availableCopies ?? total;
    const expectedAvailable = Math.max(0, total - borrowedQty);

    if (actualAvailable !== expectedAvailable) {
      report.discrepancyCount++;
      report.discrepancies.push({
        bookId: bookIdStr,
        title: book.title,
        totalCopies: total,
        borrowedQuantity: borrowedQty,
        actualAvailable,
        expectedAvailable,
        difference: actualAvailable - expectedAvailable,
      });
    } else {
      report.consistentCount++;
    }
  }

  return report;
}
