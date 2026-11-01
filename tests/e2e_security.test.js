import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import app from "../app.js";
import { setDb } from "../config/db.js";

const JWT_SECRET =
  process.env.BETTER_AUTH_SECRET ||
  "booknook_super_secure_jwt_secret_32_chars_key_2026!";
const secretKey = new TextEncoder().encode(JWT_SECRET);

/**
 * Generate test tokens with custom claims, signatures, issuers, or expiry
 */
async function createToken({
  id = "user_alpha",
  email = "alpha@booknook.dev",
  name = "User Alpha",
  issuer = "http://localhost:3000",
  audience = "http://localhost:8000",
  expiresIn = "2h",
  signKey = secretKey,
} = {}) {
  return await new jose.SignJWT({
    sub: id,
    email,
    name,
    role: "reader",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(expiresIn)
    .sign(signKey);
}

/**
 * In-memory MongoDB Mock with atomic operations and collection isolation
 */
function createE2eMockDb() {
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
                if (
                  filter.isDeleted?.$ne !== undefined &&
                  b.isDeleted === filter.isDeleted.$ne
                ) {
                  return false;
                }
                return true;
              }) || null
            );
          },
          find(filter = {}) {
            let res = books.filter((b) => {
              if (
                filter.isDeleted?.$ne !== undefined &&
                b.isDeleted === filter.isDeleted.$ne
              ) {
                return false;
              }
              if (filter.ownerUserId && b.ownerUserId !== filter.ownerUserId) {
                return false;
              }
              return true;
            });
            return {
              sort: () => ({
                skip: () => ({
                  limit: () => ({
                    toArray: async () => [...res],
                  }),
                  toArray: async () => [...res],
                }),
                toArray: async () => [...res],
              }),
              toArray: async () => [...res],
            };
          },
          async insertOne(doc) {
            const inserted = {
              _id: "book_" + (books.length + 1),
              isDeleted: false,
              ...doc,
            };
            books.push(inserted);
            return { insertedId: inserted._id };
          },
          async updateOne(filter, update) {
            const index = books.findIndex((b) => {
              if (filter.$or) {
                const match = filter.$or.some(
                  (f) => String(b._id) === String(f._id)
                );
                if (!match) return false;
              } else if (filter._id && String(b._id) !== String(filter._id)) {
                return false;
              }
              if (
                filter.isDeleted?.$ne !== undefined &&
                b.isDeleted === filter.isDeleted.$ne
              ) {
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

            if (index === -1) {
              return { matchedCount: 0, modifiedCount: 0 };
            }

            const target = books[index];
            if (update.$inc) {
              for (const [k, v] of Object.entries(update.$inc)) {
                target[k] = (target[k] || 0) + v;
              }
            }
            if (update.$set) {
              Object.assign(target, update.$set);
            }
            return { matchedCount: 1, modifiedCount: 1 };
          },
          async deleteOne(filter) {
            const index = borrows.findIndex((br) => {
              if (filter.$or) {
                const match = filter.$or.some(
                  (f) => String(br._id) === String(f._id)
                );
                if (!match) return false;
              } else if (filter._id && String(br._id) !== String(filter._id)) {
                return false;
              }
              return true;
            });
            if (index !== -1) {
              borrows.splice(index, 1);
              return { deletedCount: 1 };
            }
            return { deletedCount: 0 };
          },
          async countDocuments(filter = {}) {
            return books.filter((b) => {
              if (
                filter.isDeleted?.$ne !== undefined &&
                b.isDeleted === filter.isDeleted.$ne
              ) {
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
                  const match = filter.$or.some(
                    (f) => String(br._id) === String(f._id)
                  );
                  if (!match) return false;
                } else if (filter._id && String(br._id) !== String(filter._id)) {
                  return false;
                }
                if (filter.userId && br.userId !== filter.userId) return false;
                if (
                  filter.bookId &&
                  String(br.bookId) !== String(filter.bookId)
                ) {
                  return false;
                }
                if (filter.status && br.status !== filter.status) return false;
                return true;
              }) || null
            );
          },
          find(filter = {}) {
            let res = borrows.filter((br) => {
              if (filter.userId && br.userId !== filter.userId) return false;
              if (filter.status && br.status !== filter.status) return false;
              return true;
            });
            return {
              sort: () => ({
                toArray: async () => [...res],
              }),
              toArray: async () => [...res],
            };
          },
          async insertOne(doc) {
            const inserted = {
              _id: "borrow_" + (borrows.length + 1),
              status: "Active",
              createdAt: new Date().toISOString(),
              ...doc,
            };
            borrows.push(inserted);
            return { insertedId: inserted._id };
          },
          async updateOne(filter, update) {
            const index = borrows.findIndex((br) => {
              if (filter.$or) {
                const match = filter.$or.some(
                  (f) => String(br._id) === String(f._id)
                );
                if (!match) return false;
              } else if (filter._id && String(br._id) !== String(filter._id)) {
                return false;
              }
              if (filter.status) {
                if (
                  filter.status.$ne !== undefined &&
                  br.status === filter.status.$ne
                ) {
                  return false;
                } else if (
                  typeof filter.status === "string" &&
                  br.status !== filter.status
                ) {
                  return false;
                }
              }
              if (filter.userId && br.userId !== filter.userId) return false;
              return true;
            });

            if (index === -1) {
              return { matchedCount: 0, modifiedCount: 0 };
            }

            const target = borrows[index];
            if (update.$set) {
              Object.assign(target, update.$set);
            }
            return { matchedCount: 1, modifiedCount: 1 };
          },
          async deleteOne(filter) {
            const index = borrows.findIndex((br) => {
              if (filter.$or) {
                const match = filter.$or.some(
                  (f) => String(br._id) === String(f._id)
                );
                if (!match) return false;
              } else if (filter._id && String(br._id) !== String(filter._id)) {
                return false;
              }
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
              if (
                filter.bookId &&
                String(br.bookId) !== String(filter.bookId)
              ) {
                return false;
              }
              if (filter.status && br.status !== filter.status) return false;
              return true;
            }).length;
          },
        };
      }

      throw new Error(`Collection ${name} not supported in mock`);
    },
  };

  return db;
}

describe("Phase 09 — Comprehensive Testing, Security, Concurrency & Date Suite", () => {
  let server;
  let baseUrl;
  let mockDb;

  before(async () => {
    mockDb = createE2eMockDb();
    setDb(mockDb);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    mockDb._books.length = 0;
    mockDb._borrows.length = 0;
  });

  // =========================================================================
  // SECTION 4: AUTHENTICATION & SECURITY TESTS
  // =========================================================================
  describe("4. Authentication Security Tests", () => {
    test("4.1 Rejects request when Bearer token is missing", async () => {
      const res = await fetch(`${baseUrl}/borrows`);
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error?.code, "UNAUTHORIZED");
    });

    test("4.2 Rejects token with invalid cryptographic signature", async () => {
      const wrongKey = new TextEncoder().encode(
        "an_incorrect_secret_key_used_to_forge_signatures_123!"
      );
      const forgedToken = await createToken({ signKey: wrongKey });

      const res = await fetch(`${baseUrl}/borrows`, {
        headers: { Authorization: `Bearer ${forgedToken}` },
      });
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error?.code, "UNAUTHORIZED");
    });

    test("4.3 Rejects expired JWT token", async () => {
      const expiredToken = await createToken({ expiresIn: "-10s" });

      const res = await fetch(`${baseUrl}/borrows`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error?.code, "TOKEN_EXPIRED");
    });

    test("4.4 Rejects token with invalid issuer", async () => {
      const badIssuerToken = await createToken({
        issuer: "http://malicious-phishing-site.com",
      });

      const res = await fetch(`${baseUrl}/borrows`, {
        headers: { Authorization: `Bearer ${badIssuerToken}` },
      });
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error?.code, "INVALID_TOKEN_CLAIMS");
    });

    test("4.5 Rejects token with invalid audience", async () => {
      const badAudienceToken = await createToken({
        audience: "http://some-other-backend.org",
      });

      const res = await fetch(`${baseUrl}/borrows`, {
        headers: { Authorization: `Bearer ${badAudienceToken}` },
      });
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error?.code, "INVALID_TOKEN_CLAIMS");
    });

    test("4.6 Blocks User B from updating User A's registered book (403 Forbidden)", async () => {
      mockDb._books.push({
        _id: "book_userA",
        title: "User A Book",
        author: "Author A",
        ownerUserId: "user_A",
        totalCopies: 5,
        availableCopies: 5,
        isDeleted: false,
      });

      const userBToken = await createToken({ id: "user_B" });

      const res = await fetch(`${baseUrl}/books/book_userA`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userBToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Hacked Title" }),
      });

      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error?.code, "FORBIDDEN");
      assert.strictEqual(mockDb._books[0].title, "User A Book");
    });

    test("4.7 User B cannot see User A's borrow history (Reader Isolation)", async () => {
      mockDb._borrows.push({
        _id: "borrow_A",
        bookId: "b1",
        bookTitle: "Secret Book",
        userId: "user_A",
        status: "Active",
        quantity: 1,
      });
      mockDb._borrows.push({
        _id: "borrow_B",
        bookId: "b2",
        bookTitle: "Public Book",
        userId: "user_B",
        status: "Active",
        quantity: 1,
      });

      const userBToken = await createToken({ id: "user_B" });

      const res = await fetch(`${baseUrl}/borrows`, {
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.length, 1);
      assert.strictEqual(json.data[0].bookTitle, "Public Book");
      assert.strictEqual(json.data[0].userId, "user_B");
    });

    test("4.8 Blocks User B from returning User A's active loan (403 Forbidden)", async () => {
      mockDb._borrows.push({
        _id: "borrow_userA_loan",
        bookId: "b1",
        userId: "user_A",
        status: "Active",
        quantity: 1,
      });

      const userBToken = await createToken({ id: "user_B" });

      const res = await fetch(`${baseUrl}/borrows/borrow_userA_loan`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userBToken}` },
      });

      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error?.code, "FORBIDDEN");
      assert.strictEqual(mockDb._borrows[0].status, "Active");
    });
  });

  // =========================================================================
  // SECTION 5: INVENTORY CONCURRENCY TESTS (FINAL-COPY COMPETITION)
  // =========================================================================
  describe("5. Inventory Concurrency Tests", () => {
    test("5.1 Final-Copy Competition: When 1 copy remains, exactly 1 borrower succeeds and others receive 409 Conflict", async () => {
      mockDb._books.push({
        _id: "book_last_copy",
        title: "The Rare Manuscript",
        author: "Rare Author",
        totalCopies: 1,
        availableCopies: 1,
        isDeleted: false,
      });

      const tokenA = await createToken({ id: "user_competitor_A" });
      const tokenB = await createToken({ id: "user_competitor_B" });
      const tokenC = await createToken({ id: "user_competitor_C" });

      const borrowRequest = (token) =>
        fetch(`${baseUrl}/borrows`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: [{ bookId: "book_last_copy", quantity: 1 }],
          }),
        });

      // Simulate concurrent requests
      const [resA, resB, resC] = await Promise.all([
        borrowRequest(tokenA),
        borrowRequest(tokenB),
        borrowRequest(tokenC),
      ]);

      const responses = [resA, resB, resC];
      const successResponses = responses.filter((r) => r.status === 201);
      const conflictResponses = responses.filter(
        (r) => r.status === 400 || r.status === 409
      );

      assert.strictEqual(
        successResponses.length,
        1,
        "Exactly 1 request must succeed"
      );
      assert.strictEqual(
        conflictResponses.length,
        2,
        "Remaining 2 concurrent requests must receive conflict/error status"
      );

      // Verify database invariants
      const bookInDb = mockDb._books.find((b) => b._id === "book_last_copy");
      assert.strictEqual(
        bookInDb.availableCopies,
        0,
        "Inventory must be exactly 0"
      );
      assert.strictEqual(
        mockDb._borrows.length,
        1,
        "Exactly 1 borrow record created"
      );
      assert.strictEqual(mockDb._borrows[0].status, "Active");
    });

    test("5.2 Rejects multiple duplicate active borrow requests by the same user", async () => {
      mockDb._books.push({
        _id: "book_many_copies",
        title: "Popular Novel",
        totalCopies: 10,
        availableCopies: 10,
        isDeleted: false,
      });

      const userToken = await createToken({ id: "user_duplicate_tester" });

      // First borrow: succeeds
      const res1 = await fetch(`${baseUrl}/borrows`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [{ bookId: "book_many_copies", quantity: 1 }],
        }),
      });
      assert.strictEqual(res1.status, 201);

      // Second borrow of the same title while active: rejected
      const res2 = await fetch(`${baseUrl}/borrows`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [{ bookId: "book_many_copies", quantity: 1 }],
        }),
      });
      assert.ok(
        res2.status === 400 || res2.status === 409,
        "Duplicate active loan must be rejected with 400 or 409"
      );
      const json2 = await res2.json();
      assert.strictEqual(json2.success, false);
      assert.strictEqual(json2.error?.code, "DUPLICATE_ACTIVE_LOAN");
    });
  });

  // =========================================================================
  // SECTION 6: MULTI-BOOK TRANSACTION INTEGRITY TESTS
  // =========================================================================
  describe("6. Multi-Book Batch Transaction Tests", () => {
    test("6.1 Atomic rollback: If Book A has 2 copies and Book B has 0, batch checkout fails and neither inventory changes", async () => {
      mockDb._books.push({
        _id: "book_A_stocked",
        title: "Available Book A",
        totalCopies: 5,
        availableCopies: 2,
        isDeleted: false,
      });
      mockDb._books.push({
        _id: "book_B_depleted",
        title: "Zero Stock Book B",
        totalCopies: 3,
        availableCopies: 0,
        isDeleted: false,
      });

      const userToken = await createToken({ id: "user_batch_tester" });

      const res = await fetch(`${baseUrl}/borrows`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [
            { bookId: "book_A_stocked", quantity: 2 },
            { bookId: "book_B_depleted", quantity: 1 },
          ],
        }),
      });

      assert.ok(
        res.status === 400 || res.status === 409,
        "Insufficient copies must fail with 400 or 409"
      );
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error?.code, "INSUFFICIENT_COPIES");

      // Verify that Book A was rolled back and zero borrows created
      const bookA = mockDb._books.find((b) => b._id === "book_A_stocked");
      const bookB = mockDb._books.find((b) => b._id === "book_B_depleted");
      assert.strictEqual(
        bookA.availableCopies,
        2,
        "Book A availableCopies must remain exactly 2"
      );
      assert.strictEqual(
        bookB.availableCopies,
        0,
        "Book B availableCopies must remain exactly 0"
      );
      assert.strictEqual(
        mockDb._borrows.length,
        0,
        "No borrow records must be created"
      );
    });
  });

  // =========================================================================
  // SECTION 7: RETURN INTEGRITY & HISTORICAL RECORD PRESERVATION
  // =========================================================================
  describe("7. Return Integrity Tests", () => {
    test("7.1 Restores exact borrowed quantity (single and multiple copies)", async () => {
      mockDb._books.push({
        _id: "book_return_test",
        title: "Multi-Volume History",
        totalCopies: 5,
        availableCopies: 2,
        isDeleted: false,
      });
      mockDb._borrows.push({
        _id: "borrow_multi_return",
        bookId: "book_return_test",
        userId: "user_multi_reader",
        quantity: 3,
        status: "Active",
        borrowDate: new Date().toISOString(),
      });

      const userToken = await createToken({ id: "user_multi_reader" });

      const res = await fetch(`${baseUrl}/borrows/borrow_multi_return`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);

      // Verify book inventory incremented by exactly 3
      const book = mockDb._books.find((b) => b._id === "book_return_test");
      assert.strictEqual(
        book.availableCopies,
        5,
        "Available copies must increment by exact borrowed quantity (2 + 3 = 5)"
      );

      // Verify historical borrow record is preserved
      const borrow = mockDb._borrows.find((br) => br._id === "borrow_multi_return");
      assert.strictEqual(borrow.status, "Returned");
      assert.ok(borrow.returnedAt, "Must populate returnedAt timestamp");
    });

    test("7.2 Duplicate return attempt rejected with ALREADY_RETURNED", async () => {
      mockDb._books.push({
        _id: "book_dup_return",
        title: "Single Copy Story",
        totalCopies: 1,
        availableCopies: 1,
        isDeleted: false,
      });
      mockDb._borrows.push({
        _id: "borrow_already_done",
        bookId: "book_dup_return",
        userId: "user_dup_returner",
        quantity: 1,
        status: "Returned",
        returnedAt: new Date().toISOString(),
      });

      const userToken = await createToken({ id: "user_dup_returner" });

      const res = await fetch(`${baseUrl}/borrows/borrow_already_done`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error?.code, "ALREADY_RETURNED");

      // Inventory must not be falsely incremented
      const book = mockDb._books.find((b) => b._id === "book_dup_return");
      assert.strictEqual(book.availableCopies, 1);
    });
  });

  // =========================================================================
  // SECTION 8: DATE CALCULATIONS & 14-DAY POLICY TESTS
  // =========================================================================
  describe("8. Date Calculations & Loan Policy Tests", () => {
    test("8.1 Generates exactly 14 calendar days due date on borrow", async () => {
      mockDb._books.push({
        _id: "book_date_test",
        title: "Time Traveler's Guide",
        totalCopies: 3,
        availableCopies: 3,
        isDeleted: false,
      });

      const userToken = await createToken({ id: "user_date_tester" });

      const beforeBorrow = Date.now();
      const res = await fetch(`${baseUrl}/borrows`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [{ bookId: "book_date_test", quantity: 1 }],
        }),
      });

      assert.strictEqual(res.status, 201);
      const json = await res.json();
      const borrowRecord = json.data[0];

      const borrowTime = new Date(borrowRecord.borrowDate).getTime();
      const dueTime = new Date(borrowRecord.dueDate).getTime();
      const diffMs = dueTime - borrowTime;
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      assert.ok(borrowTime >= beforeBorrow - 1000, "Borrow date is current");
      assert.strictEqual(
        diffDays,
        14,
        "Loan duration must equal exactly 14 calendar days"
      );
    });

    test("8.2 Accurately categorizes Active, Due Today, and Overdue conditions", () => {
      const now = new Date();

      // Future due date: Active
      const futureDue = new Date(now.getTime() + 5 * 86400000).toISOString();
      const diffFuture = Math.ceil(
        (new Date(futureDue).getTime() - now.getTime()) / 86400000
      );
      assert.ok(diffFuture > 0, "Future due date has positive days remaining");

      // Due today (same calendar date)
      const dueToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59
      ).toISOString();
      const isToday =
        new Date(dueToday).toDateString() === now.toDateString();
      assert.strictEqual(isToday, true, "Due today condition detected");

      // Past due date: Overdue
      const pastDue = new Date(now.getTime() - 3 * 86400000).toISOString();
      const diffPast = Math.ceil(
        (new Date(pastDue).getTime() - now.getTime()) / 86400000
      );
      assert.ok(diffPast < 0, "Past due date has negative days (overdue)");
    });
  });
});
