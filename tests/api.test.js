import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import app from "../app.js";
import { setDb } from "../config/db.js";

/**
 * Generate a cryptographically valid test JWT matching BetterAuth format
 */
async function generateTestToken({
  id = "usr_tester_1",
  email = "tester@booknook.dev",
  name = "Test Reader",
  role = "reader",
} = {}) {
  const secretKey = new TextEncoder().encode(
    process.env.BETTER_AUTH_SECRET ||
      "booknook_super_secure_jwt_secret_32_chars_key_2026!"
  );

  return await new jose.SignJWT({
    sub: id,
    email,
    name,
    role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("http://localhost:3000")
    .setAudience("http://localhost:8000")
    .setExpirationTime("2h")
    .sign(secretKey);
}

/**
 * Fast In-Memory Database Mock for API Testing
 */
function createApiMockDb() {
  const books = [];
  const borrows = [];

  const db = {
    _books: books,
    _borrows: borrows,
    collection(name) {
      if (name === "books") {
        return {
          async findOne(filter) {
            return (
              books.find((b) => {
                if (filter.$or) {
                  const match = filter.$or.some(
                    (f) => String(b._id) === String(f._id)
                  );
                  if (!match) return false;
                } else if (filter._id && String(b._id) !== String(filter._id)) {
                  return false;
                }
                if (filter.isDeleted?.$ne !== undefined) {
                  if (b.isDeleted === filter.isDeleted.$ne) return false;
                }
                return true;
              }) || null
            );
          },
          find(filter = {}) {
            let result = books.filter((b) => {
              if (filter.isDeleted?.$ne !== undefined && b.isDeleted === filter.isDeleted.$ne) {
                return false;
              }
              if (filter.category && b.category !== filter.category) {
                return false;
              }
              if (filter.$or) {
                const match = filter.$or.some((cond) => {
                  if (cond.title && cond.title.test(b.title)) return true;
                  if (cond.author && cond.author.test(b.author)) return true;
                  return false;
                });
                if (!match) return false;
              }
              return true;
            });

            return {
              sort(sortOptions) {
                if (sortOptions.availableCopies === -1) {
                  result.sort((a, b) => b.availableCopies - a.availableCopies);
                } else if (sortOptions.rating === -1) {
                  result.sort((a, b) => b.rating - a.rating);
                }
                return this;
              },
              skip(n) {
                result = result.slice(n);
                return this;
              },
              limit(n) {
                result = result.slice(0, n);
                return this;
              },
              toArray: async () => [...result],
            };
          },
          async insertOne(doc) {
            const inserted = { _id: "book_" + (books.length + 1), ...doc };
            books.push(inserted);
            return { insertedId: inserted._id };
          },
          async updateOne(filter, update) {
            const index = books.findIndex((b) => {
              if (filter.$or) {
                const match = filter.$or.some((f) => String(b._id) === String(f._id));
                if (!match) return false;
              } else if (filter._id && String(b._id) !== String(filter._id)) {
                return false;
              }
              if (filter.isDeleted?.$ne !== undefined && b.isDeleted === filter.isDeleted.$ne) {
                return false;
              }
              if (
                filter.availableCopies?.$gte !== undefined &&
                b.availableCopies < filter.availableCopies.$gte
              ) {
                return false;
              }
              return true;
            });

            if (index === -1) return { matchedCount: 0, modifiedCount: 0 };
            const target = books[index];
            if (update.$inc) {
              for (const [k, v] of Object.entries(update.$inc)) {
                target[k] = (target[k] || 0) + v;
              }
            }
            if (update.$set) Object.assign(target, update.$set);
            return { matchedCount: 1, modifiedCount: 1 };
          },
          async countDocuments(filter = {}) {
            return books.filter((b) => {
              if (filter.isDeleted?.$ne !== undefined && b.isDeleted === filter.isDeleted.$ne) {
                return false;
              }
              return true;
            }).length;
          },
        };
      }

      if (name === "borrows") {
        return {
          async findOne(filter) {
            return (
              borrows.find((br) => {
                if (filter.$or) {
                  const match = filter.$or.some((f) => String(br._id) === String(f._id));
                  if (!match) return false;
                } else if (filter._id && String(br._id) !== String(filter._id)) {
                  return false;
                }
                if (filter.userId && br.userId !== filter.userId) return false;
                if (filter.bookId && String(br.bookId) !== String(filter.bookId)) return false;
                if (filter.status && br.status !== filter.status) return false;
                return true;
              }) || null
            );
          },
          find(filter = {}) {
            const result = borrows.filter((br) => {
              if (filter.userId && br.userId !== filter.userId) return false;
              if (filter.status && br.status !== filter.status) return false;
              return true;
            });
            return {
              sort() {
                return this;
              },
              toArray: async () => [...result],
            };
          },
          async insertOne(doc) {
            const inserted = { _id: "borrow_" + (borrows.length + 1), ...doc };
            borrows.push(inserted);
            return { insertedId: inserted._id };
          },
          async updateOne(filter, update) {
            const index = borrows.findIndex((br) => {
              if (filter.$or) {
                const match = filter.$or.some((f) => String(br._id) === String(f._id));
                if (!match) return false;
              } else if (filter._id && String(br._id) !== String(filter._id)) {
                return false;
              }
              if (filter.status?.$ne && br.status === filter.status.$ne) return false;
              return true;
            });
            if (index === -1) return { matchedCount: 0, modifiedCount: 0 };
            const target = borrows[index];
            if (update.$set) Object.assign(target, update.$set);
            return { matchedCount: 1, modifiedCount: 1 };
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

describe("Phase 05 — Express Backend API Engineering Suite", () => {
  let server;
  let baseUrl;
  let mockDb;
  let validToken;
  let otherUserToken;

  before(async () => {
    // Start ephemeral server
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    validToken = await generateTestToken({ id: "usr_alice", name: "Alice", email: "alice@booknook.dev" });
    otherUserToken = await generateTestToken({ id: "usr_bob", name: "Bob", email: "bob@booknook.dev" });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    mockDb = createApiMockDb();
    setDb(mockDb, null);

    // Seed mock data
    mockDb._books.push(
      {
        _id: "book_1",
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        category: "Classic",
        rating: 4.8,
        totalCopies: 4,
        availableCopies: 4,
        copies: 4,
        isDeleted: false,
        ownerUserId: "usr_alice",
      },
      {
        _id: "book_2",
        title: "Clean Architecture",
        author: "Robert C. Martin",
        category: "Technology",
        rating: 4.9,
        totalCopies: 2,
        availableCopies: 2,
        copies: 2,
        isDeleted: false,
        ownerUserId: "usr_alice",
      }
    );
  });

  // -------------------------------------------------------------
  // OPERATION 1: GET /books (Catalog, Search, Filter, Pagination)
  // -------------------------------------------------------------
  test("1. GET /books returns standardized catalog with search & category filtering", async () => {
    // A. Fetch All
    const resAll = await fetch(`${baseUrl}/books`);
    assert.equal(resAll.status, 200);
    const jsonAll = await resAll.json();
    assert.equal(jsonAll.success, true);
    assert.equal(jsonAll.data.length, 2);

    // B. Category Filter
    const resCat = await fetch(`${baseUrl}/books?category=Classic`);
    const jsonCat = await resCat.json();
    assert.equal(jsonCat.data.length, 1);
    assert.equal(jsonCat.data[0].title, "The Great Gatsby");

    // C. Search Query
    const resSearch = await fetch(`${baseUrl}/books?search=Architecture`);
    const jsonSearch = await resSearch.json();
    assert.equal(jsonSearch.data.length, 1);
    assert.equal(jsonSearch.data[0].author, "Robert C. Martin");

    // D. Pagination
    const resPage = await fetch(`${baseUrl}/books?page=1&limit=1`);
    const jsonPage = await resPage.json();
    assert.equal(jsonPage.data.length, 1);
    assert.equal(jsonPage.pagination.total, 2);
    assert.equal(jsonPage.pagination.totalPages, 2);
  });

  // -------------------------------------------------------------
  // OPERATION 2: GET /books/:id (Single Book & 404 Guard)
  // -------------------------------------------------------------
  test("2. GET /books/:id returns book details or 404 if missing", async () => {
    const resFound = await fetch(`${baseUrl}/books/book_1`);
    assert.equal(resFound.status, 200);
    const jsonFound = await resFound.json();
    assert.equal(jsonFound.data.title, "The Great Gatsby");

    const resMissing = await fetch(`${baseUrl}/books/book_nonexistent`);
    assert.equal(resMissing.status, 404);
    const jsonMissing = await resMissing.json();
    assert.equal(jsonMissing.success, false);
    assert.equal(jsonMissing.error.code, "NOT_FOUND");
  });

  // -------------------------------------------------------------
  // OPERATION 3: POST /books (Auth, Input Validation, Security)
  // -------------------------------------------------------------
  test("3. POST /books creates book with verified user context or rejects invalid/unauthorized", async () => {
    // A. Missing Auth Header -> 401
    const resNoAuth = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Unauthorized Book" }),
    });
    assert.equal(resNoAuth.status, 401);

    // B. Missing Title -> 400 Validation Error
    const resNoTitle = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ author: "Someone" }),
    });
    assert.equal(resNoTitle.status, 400);
    const jsonNoTitle = await resNoTitle.json();
    assert.equal(jsonNoTitle.error.code, "VALIDATION_ERROR");

    // C. NoSQL Operator Injection Attempt -> 400 INVALID_INPUT
    const resInjection = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        title: "Hacked Book",
        $where: "function() { return true; }",
      }),
    });
    assert.equal(resInjection.status, 400);
    const jsonInj = await resInjection.json();
    assert.equal(jsonInj.error.code, "INVALID_INPUT");

    // D. Valid Creation -> 201
    const resValid = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        title: "Domain-Driven Design",
        author: "Eric Evans",
        category: "Technology",
        totalCopies: 3,
        description: "Tackling complexity in the heart of software.",
      }),
    });
    assert.equal(resValid.status, 201);
    const jsonValid = await resValid.json();
    assert.equal(jsonValid.success, true);
    assert.equal(jsonValid.data.title, "Domain-Driven Design");
    assert.equal(jsonValid.data.ownerUserId, "usr_alice");
    assert.equal(jsonValid.data.availableCopies, 3);
  });

  // -------------------------------------------------------------
  // OPERATION 4: PATCH & PUT /books/:id (Ownership & Inventory Guard)
  // -------------------------------------------------------------
  test("4. PATCH /books/:id updates book, rejects unauthorized/forbidden updates, and enforces inventory bounds", async () => {
    // A. Forbidden (Bob trying to update Alice's book) -> 403
    const resForbidden = await fetch(`${baseUrl}/books/book_1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${otherUserToken}`,
      },
      body: JSON.stringify({ title: "Hacked Title" }),
    });
    assert.equal(resForbidden.status, 403);
    const jsonForbidden = await resForbidden.json();
    assert.equal(jsonForbidden.error.code, "FORBIDDEN");

    // B. Valid Update by Owner (Alice) -> 200
    const resOwner = await fetch(`${baseUrl}/books/book_1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ description: "Updated masterpiece description." }),
    });
    assert.equal(resOwner.status, 200);

    // C. Legacy PUT alias -> 200
    const resPut = await fetch(`${baseUrl}/books/book_1`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ rating: 5.0 }),
    });
    assert.equal(resPut.status, 200);
  });

  // -------------------------------------------------------------
  // OPERATION 5: DELETE /books/:id (Active Loans Guard & Soft Delete)
  // -------------------------------------------------------------
  test("5. DELETE /books/:id blocks deletion if active loans exist, otherwise soft deletes", async () => {
    // Add active loan to book_1
    mockDb._borrows.push({
      _id: "borrow_active",
      bookId: "book_1",
      userId: "usr_reader_x",
      status: "Active",
      quantity: 1,
    });

    // Attempting delete with active loan -> 400 CANNOT_DELETE_ACTIVE_LOANS
    const resBlocked = await fetch(`${baseUrl}/books/book_1`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${validToken}` },
    });
    assert.equal(resBlocked.status, 400);
    const jsonBlocked = await resBlocked.json();
    assert.equal(jsonBlocked.error.code, "CANNOT_DELETE_ACTIVE_LOANS");

    // Remove active loan
    mockDb._borrows.length = 0;

    // Delete succeeds -> soft delete (isDeleted: true)
    const resSuccess = await fetch(`${baseUrl}/books/book_1`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${validToken}` },
    });
    assert.equal(resSuccess.status, 200);

    const deletedBook = mockDb._books.find((b) => b._id === "book_1");
    assert.equal(deletedBook.isDeleted, true);
  });

  // -------------------------------------------------------------
  // OPERATION 6: POST /borrows (Single & Batch Borrow Bag Checkout)
  // -------------------------------------------------------------
  test("6. POST /borrows supports single & batch checkout, validates stock & prevents duplicate loans", async () => {
    // A. Single Item Checkout
    const resSingle = await fetch(`${baseUrl}/borrows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ bookId: "book_2", quantity: 1 }),
    });
    assert.equal(resSingle.status, 201);
    const jsonSingle = await resSingle.json();
    assert.equal(jsonSingle.success, true);
    assert.equal(jsonSingle.data[0].bookId, "book_2");

    // B. Duplicate Active Loan Attempt -> 400
    const resDup = await fetch(`${baseUrl}/borrows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ bookId: "book_2", quantity: 1 }),
    });
    assert.equal(resDup.status, 400);
    const jsonDup = await resDup.json();
    assert.equal(jsonDup.error.code, "DUPLICATE_ACTIVE_LOAN");

    // C. Multi-book Batch Checkout (Bob checks out book_2 with remaining 1 copy)
    const resBatch = await fetch(`${baseUrl}/borrows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${otherUserToken}`,
      },
      body: JSON.stringify({
        items: [{ bookId: "book_2", quantity: 1 }],
      }),
    });
    assert.equal(resBatch.status, 201);

    // Now book_2 has 0 copies available. Further borrow should reject with INSUFFICIENT_COPIES
    const resExhausted = await fetch(`${baseUrl}/borrows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${otherUserToken}`,
      },
      body: JSON.stringify({ bookId: "book_2", quantity: 1 }),
    });
    assert.equal(resExhausted.status, 400);
  });

  // -------------------------------------------------------------
  // OPERATION 7: GET /borrows (Scoped to Authenticated User)
  // -------------------------------------------------------------
  test("7. GET /borrows returns only the loans belonging to the authenticated caller", async () => {
    const resAlice = await fetch(`${baseUrl}/borrows`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    assert.equal(resAlice.status, 200);
    const jsonAlice = await resAlice.json();
    assert.equal(
      jsonAlice.data.every((b) => b.userId === "usr_alice"),
      true
    );
  });

  // -------------------------------------------------------------
  // OPERATION 8: DELETE & PUT /borrows/:id (Return Book Loan)
  // -------------------------------------------------------------
  test("8. DELETE /borrows/:id returns book, restores stock, and prevents double-return", async () => {
    // Alice borrows book_1 first
    const borrowRes = await fetch(`${baseUrl}/borrows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ bookId: "book_1", quantity: 1 }),
    });
    assert.equal(borrowRes.status, 201);
    const borrowJson = await borrowRes.json();
    const aliceLoan = borrowJson.data[0];
    assert.ok(aliceLoan);

    // A. Bob cannot return Alice's loan -> 403 FORBIDDEN
    const resBobReturn = await fetch(`${baseUrl}/borrows/${aliceLoan._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    assert.equal(resBobReturn.status, 403);

    // B. Alice returns her loan -> 200
    const resAliceReturn = await fetch(`${baseUrl}/borrows/${aliceLoan._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${validToken}` },
    });
    assert.equal(resAliceReturn.status, 200);
    const jsonAliceReturn = await resAliceReturn.json();
    assert.equal(jsonAliceReturn.success, true);

    // C. Double-return attempt -> 400 ALREADY_RETURNED
    const resDoubleReturn = await fetch(`${baseUrl}/borrows/${aliceLoan._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${validToken}` },
    });
    assert.equal(resDoubleReturn.status, 400);
    const jsonDouble = await resDoubleReturn.json();
    assert.equal(jsonDouble.error.code, "ALREADY_RETURNED");
  });
});
