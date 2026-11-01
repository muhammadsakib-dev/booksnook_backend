import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  borrowBooks,
  returnBook,
  deleteBook,
  updateBook,
  reconcileInventory,
} from "../services/inventoryService.js";

/**
 * In-Memory Mock Database Engine
 * Emulates MongoDB operations used by inventoryService:
 * - findOne, find, insertOne, updateOne, countDocuments, aggregate
 * - Conditional filters ($gte, $ne)
 * - Atomic modifiers ($inc, $set)
 */
function createMockDb() {
  const books = [];
  const borrows = [];

  const db = {
    _books: books,
    _borrows: borrows,
    collection(name) {
      if (name === "books") {
        return {
          async findOne(filter) {
            return books.find((b) => {
              if (filter._id) {
                const idMatch = String(b._id) === String(filter._id);
                if (!idMatch) return false;
              }
              if (filter.isDeleted?.$ne !== undefined) {
                if (b.isDeleted === filter.isDeleted.$ne) return false;
              }
              return true;
            }) || null;
          },
          find() {
            return {
              toArray: async () => [...books],
            };
          },
          async insertOne(doc) {
            const inserted = { _id: "b_" + (books.length + 1), ...doc };
            books.push(inserted);
            return { insertedId: inserted._id };
          },
          async updateOne(filter, update) {
            const index = books.findIndex((b) => {
              if (filter._id && String(b._id) !== String(filter._id)) return false;
              if (filter.isDeleted?.$ne !== undefined && b.isDeleted === filter.isDeleted.$ne)
                return false;
              if (
                filter.availableCopies?.$gte !== undefined &&
                b.availableCopies < filter.availableCopies.$gte
              ) {
                return false;
              }
              return true;
            });

            if (index === -1) {
              return { matchedCount: 0, modifiedCount: 0 };
            }

            const target = books[index];
            if (update.$inc) {
              for (const [key, val] of Object.entries(update.$inc)) {
                target[key] = (target[key] || 0) + val;
              }
            }
            if (update.$set) {
              Object.assign(target, update.$set);
            }
            return { matchedCount: 1, modifiedCount: 1 };
          },
          async countDocuments() {
            return books.length;
          },
        };
      }

      if (name === "borrows") {
        return {
          async findOne(filter) {
            return borrows.find((br) => {
              if (filter._id && String(br._id) !== String(filter._id)) return false;
              if (filter.userId && br.userId !== filter.userId) return false;
              if (filter.bookId && String(br.bookId) !== String(filter.bookId)) return false;
              if (filter.status && br.status !== filter.status) return false;
              return true;
            }) || null;
          },
          find(filter = {}) {
            return {
              toArray: async () =>
                borrows.filter((br) => {
                  if (filter.userId && br.userId !== filter.userId) return false;
                  if (filter.status && br.status !== filter.status) return false;
                  return true;
                }),
            };
          },
          async insertOne(doc) {
            const inserted = { _id: "br_" + (borrows.length + 1), ...doc };
            borrows.push(inserted);
            return { insertedId: inserted._id };
          },
          async updateOne(filter, update) {
            const index = borrows.findIndex((br) => {
              if (filter._id && String(br._id) !== String(filter._id)) return false;
              if (filter.status?.$ne && br.status === filter.status.$ne) return false;
              return true;
            });
            if (index === -1) return { matchedCount: 0, modifiedCount: 0 };
            const target = borrows[index];
            if (update.$set) Object.assign(target, update.$set);
            return { matchedCount: 1, modifiedCount: 1 };
          },
          async deleteOne(filter) {
            const index = borrows.findIndex((br) => {
              if (filter._id && String(br._id) !== String(filter._id)) return false;
              return true;
            });
            if (index !== -1) {
              borrows.splice(index, 1);
              return { deletedCount: 1 };
            }
            return { deletedCount: 0 };
          },
          async countDocuments(filter = {}) {
            return borrows.filter((br) => {
              if (filter.bookId && String(br.bookId) !== String(filter.bookId)) return false;
              if (filter.status && br.status !== filter.status) return false;
              return true;
            }).length;
          },
          aggregate(pipeline) {
            return {
              toArray: async () => {
                const match = pipeline.find((p) => p.$match)?.$match || {};
                const filtered = borrows.filter((br) => {
                  if (match.bookId && String(br.bookId) !== String(match.bookId)) return false;
                  if (match.status && br.status !== match.status) return false;
                  return true;
                });
                const sum = filtered.reduce((acc, curr) => acc + (curr.quantity || 1), 0);
                return [{ _id: null, sumQty: sum, totalBorrowed: sum }];
              },
            };
          },
        };
      }
    },
  };

  return db;
}

describe("Phase 04 — Inventory & Transaction Business Rules", () => {
  let db;
  const mockUser = {
    id: "usr_reader_1",
    email: "reader1@booknook.dev",
    name: "Alex Reader",
    role: "reader",
  };
  const mockLibrarian = {
    id: "usr_librarian_1",
    email: "librarian@booknook.dev",
    name: "Head Librarian",
    role: "librarian",
  };

  beforeEach(() => {
    db = createMockDb();
    // Seed initial test books
    db._books.push(
      {
        _id: "book_1",
        title: "Clean Code",
        author: "Robert C. Martin",
        totalCopies: 5,
        availableCopies: 5,
        copies: 5,
        isDeleted: false,
        ownerUserId: "usr_owner_1",
      },
      {
        _id: "book_scarce",
        title: "Rare Manuscript",
        author: "Ancient Author",
        totalCopies: 1,
        availableCopies: 1,
        copies: 1,
        isDeleted: false,
        ownerUserId: "usr_owner_1",
      }
    );
  });

  // -------------------------------------------------------------
  // Test 1: Atomic Decrement on Valid Borrow
  // -------------------------------------------------------------
  test("Successfully borrows a book with atomic stock decrement and 14-day loan period", async () => {
    const borrows = await borrowBooks({
      client: null,
      db,
      user: mockUser,
      items: [{ bookId: "book_1", quantity: 2 }],
    });

    assert.equal(borrows.length, 1);
    assert.equal(borrows[0].quantity, 2);
    assert.equal(borrows[0].status, "Active");
    assert.equal(borrows[0].userId, mockUser.id);

    // Verify 14-day loan period
    const borrowDate = new Date(borrows[0].borrowDate);
    const dueDate = new Date(borrows[0].dueDate);
    const diffDays = Math.round((dueDate - borrowDate) / (1000 * 60 * 60 * 24));
    assert.equal(diffDays, 14);

    // Verify inventory decremented: 5 - 2 = 3
    const book = db._books.find((b) => b._id === "book_1");
    assert.equal(book.availableCopies, 3);
  });

  // -------------------------------------------------------------
  // Test 2: Reject Borrow when Stock is Insufficient
  // -------------------------------------------------------------
  test("Rejects borrow request when requested quantity exceeds availableCopies", async () => {
    await assert.rejects(
      async () => {
        await borrowBooks({
          client: null,
          db,
          user: mockUser,
          items: [{ bookId: "book_scarce", quantity: 3 }],
        });
      },
      (err) => {
        assert.equal(err.code, "INSUFFICIENT_COPIES");
        assert.equal(err.status, 400);
        return true;
      }
    );

    // Inventory must remain untouched
    const book = db._books.find((b) => b._id === "book_scarce");
    assert.equal(book.availableCopies, 1);
  });

  // -------------------------------------------------------------
  // Test 3: Duplicate Active Loan Prevention
  // -------------------------------------------------------------
  test("Prevents same user from borrowing duplicate active copy of the same book", async () => {
    // 1st borrow succeeds
    await borrowBooks({
      client: null,
      db,
      user: mockUser,
      items: [{ bookId: "book_1", quantity: 1 }],
    });

    // 2nd borrow of same title by same user must be blocked
    await assert.rejects(
      async () => {
        await borrowBooks({
          client: null,
          db,
          user: mockUser,
          items: [{ bookId: "book_1", quantity: 1 }],
        });
      },
      (err) => {
        assert.equal(err.code, "DUPLICATE_ACTIVE_LOAN");
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  // -------------------------------------------------------------
  // Test 4: All-or-Nothing Multi-Item Batch Checkout Rollback
  // -------------------------------------------------------------
  test("Rolls back all inventory decrements if any item in the batch fails", async () => {
    // Item 1 has 5 copies (valid), Item 2 only has 1 copy but requested 5 (invalid)
    await assert.rejects(
      async () => {
        await borrowBooks({
          client: null,
          db,
          user: mockUser,
          items: [
            { bookId: "book_1", quantity: 2 },
            { bookId: "book_scarce", quantity: 5 },
          ],
        });
      },
      (err) => {
        assert.equal(err.code, "INSUFFICIENT_COPIES");
        return true;
      }
    );

    // Verify book_1 inventory was rolled back to initial 5
    const book1 = db._books.find((b) => b._id === "book_1");
    assert.equal(book1.availableCopies, 5, "First book must be rolled back on batch failure");
  });

  // -------------------------------------------------------------
  // Test 5: Return Restores Exact Borrowed Quantity & Prevents Double Return
  // -------------------------------------------------------------
  test("Restores exact borrowed quantity on return and rejects second return attempt", async () => {
    const [borrow] = await borrowBooks({
      client: null,
      db,
      user: mockUser,
      items: [{ bookId: "book_1", quantity: 3 }],
    });

    // Stock should now be 2
    let book = db._books.find((b) => b._id === "book_1");
    assert.equal(book.availableCopies, 2);

    // Return book
    const returnResult = await returnBook({
      client: null,
      db,
      user: mockUser,
      borrowId: borrow._id,
    });

    assert.equal(returnResult.quantityRestored, 3);
    book = db._books.find((b) => b._id === "book_1");
    assert.equal(book.availableCopies, 5, "Stock must be fully restored after return");

    // Second return attempt must fail with ALREADY_RETURNED
    await assert.rejects(
      async () => {
        await returnBook({
          client: null,
          db,
          user: mockUser,
          borrowId: borrow._id,
        });
      },
      (err) => {
        assert.equal(err.code, "ALREADY_RETURNED");
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  // -------------------------------------------------------------
  // Test 6: Block Deletion When Active Loans Exist
  // -------------------------------------------------------------
  test("Blocks book deletion if active loans exist, but permits after return", async () => {
    const [borrow] = await borrowBooks({
      client: null,
      db,
      user: mockUser,
      items: [{ bookId: "book_1", quantity: 1 }],
    });

    // Attempting to delete book with active loans must throw CANNOT_DELETE_ACTIVE_LOANS
    await assert.rejects(
      async () => {
        await deleteBook({
          db,
          user: { id: "usr_owner_1", role: "reader" },
          bookId: "book_1",
        });
      },
      (err) => {
        assert.equal(err.code, "CANNOT_DELETE_ACTIVE_LOANS");
        assert.equal(err.status, 400);
        return true;
      }
    );

    // Return the active loan
    await returnBook({
      client: null,
      db,
      user: mockUser,
      borrowId: borrow._id,
    });

    // Now delete succeeds with soft deletion (isDeleted: true)
    const deleteResult = await deleteBook({
      db,
      user: { id: "usr_owner_1", role: "reader" },
      bookId: "book_1",
    });

    assert.equal(deleteResult.isDeleted, true);
    const book = db._books.find((b) => b._id === "book_1");
    assert.equal(book.isDeleted, true);
  });

  // -------------------------------------------------------------
  // Test 7: Prevent Reducing totalCopies Below Active Loaned Quantity
  // -------------------------------------------------------------
  test("Guards against reducing totalCopies below currently loaned copies", async () => {
    // Borrow 3 copies out of 5
    await borrowBooks({
      client: null,
      db,
      user: mockUser,
      items: [{ bookId: "book_1", quantity: 3 }],
    });

    // Trying to reduce totalCopies to 2 (less than 3 loaned copies) must fail
    await assert.rejects(
      async () => {
        await updateBook({
          db,
          user: { id: "usr_owner_1", role: "reader" },
          bookId: "book_1",
          updateData: { totalCopies: 2 },
        });
      },
      (err) => {
        assert.equal(err.code, "INVALID_INVENTORY_BOUNDARY");
        assert.equal(err.status, 400);
        return true;
      }
    );

    // Setting totalCopies to 4 (>= 3) succeeds, adjusting available to 4 - 3 = 1
    const updateRes = await updateBook({
      db,
      user: { id: "usr_owner_1", role: "reader" },
      bookId: "book_1",
      updateData: { totalCopies: 4 },
    });
    assert.equal(updateRes.updated, true);
    const book = db._books.find((b) => b._id === "book_1");
    assert.equal(book.totalCopies, 4);
    assert.equal(book.availableCopies, 1);
  });

  // -------------------------------------------------------------
  // Test 8: Inventory Reconciliation Audit Report
  // -------------------------------------------------------------
  test("Reconciliation report accurately identifies consistent and anomalous inventory records", async () => {
    const report1 = await reconcileInventory({ db });
    assert.equal(report1.discrepancyCount, 0);
    assert.equal(report1.consistentCount, 2);

    // Inject manual anomaly in book_scarce
    const scarceBook = db._books.find((b) => b._id === "book_scarce");
    scarceBook.availableCopies = 99; // Corrupted state

    const report2 = await reconcileInventory({ db });
    assert.equal(report2.discrepancyCount, 1);
    assert.equal(report2.discrepancies[0].bookId, "book_scarce");
    assert.equal(report2.discrepancies[0].difference, 98);
  });
});
