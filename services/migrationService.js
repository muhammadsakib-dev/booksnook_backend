import "dotenv/config";
import { MongoClient } from "mongodb";

/**
 * Migration Service for BookNook Database
 * 
 * Objectives:
 * 1. Safe Index Provisioning (Partial Unique Index for Active Borrows, Search indexes)
 * 2. Schema Normalization (Ensuring isDeleted, totalCopies, availableCopies, and borrow quantities are normalized)
 * 3. Non-destructive duplicate resolution (Reports or normalizes pre-migration anomalies)
 */
export async function runDatabaseMigrations(db) {
  console.log("--> Starting BookNook Database Migration & Index Provisioning...");
  const booksColl = db.collection("books");
  const borrowsColl = db.collection("borrows");

  const migrationResults = {
    indexesCreated: [],
    booksNormalized: 0,
    borrowsNormalized: 0,
    duplicateActiveLoansFound: 0,
    timestamp: new Date().toISOString(),
  };

  // -------------------------------------------------------------
  // STEP 1: Audit & Check for Existing Duplicate Active Borrows
  // -------------------------------------------------------------
  const duplicateActiveLoans = await borrowsColl
    .aggregate([
      { $match: { status: "Active" } },
      {
        $group: {
          _id: { userId: "$userId", bookId: "$bookId" },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (duplicateActiveLoans.length > 0) {
    migrationResults.duplicateActiveLoansFound = duplicateActiveLoans.length;
    console.warn(
      `[MIGRATION WARN] Found ${duplicateActiveLoans.length} sets of duplicate active loans.`
    );
    // Keep the newest active borrow, and mark older ones as Returned to resolve index conflict safely
    for (const dup of duplicateActiveLoans) {
      console.log(
        `Resolving duplicate for user ${dup._id.userId} and book ${dup._id.bookId}...`
      );
      // Sort or preserve: keep the first, mark subsequent as Returned
      const [primaryId, ...redundantIds] = dup.ids;
      if (redundantIds.length > 0) {
        await borrowsColl.updateMany(
          { _id: { $in: redundantIds } },
          {
            $set: {
              status: "Returned",
              returnedAt: new Date().toISOString(),
              migrationNote: "Auto-closed duplicate active loan during Phase 04 migration",
            },
          }
        );
      }
    }
  }

  // -------------------------------------------------------------
  // STEP 2: Safe Index Provisioning
  // -------------------------------------------------------------
  try {
    // 1. Partial Unique Index on active borrows (Prevents double-borrowing same book)
    const activeBorrowIdx = await borrowsColl.createIndex(
      { userId: 1, bookId: 1 },
      {
        unique: true,
        partialFilterExpression: { status: "Active" },
        name: "idx_borrows_unique_active_loan",
      }
    );
    migrationResults.indexesCreated.push(activeBorrowIdx);

    // 2. Query indexes on borrows collection
    const userBorrowsIdx = await borrowsColl.createIndex(
      { userId: 1, status: 1 },
      { name: "idx_borrows_user_status" }
    );
    migrationResults.indexesCreated.push(userBorrowsIdx);

    const bookBorrowsIdx = await borrowsColl.createIndex(
      { bookId: 1, status: 1 },
      { name: "idx_borrows_book_status" }
    );
    migrationResults.indexesCreated.push(bookBorrowsIdx);

    // 3. Books collection indexes
    const booksCategoryIdx = await booksColl.createIndex(
      { isDeleted: 1, category: 1 },
      { name: "idx_books_deleted_category" }
    );
    migrationResults.indexesCreated.push(booksCategoryIdx);

    const booksOwnerIdx = await booksColl.createIndex(
      { ownerUserId: 1 },
      { name: "idx_books_owner" }
    );
    migrationResults.indexesCreated.push(booksOwnerIdx);

    console.log(
      `[MIGRATION] Successfully verified and provisioned ${migrationResults.indexesCreated.length} database indexes.`
    );
  } catch (idxErr) {
    console.error("[MIGRATION ERROR] Failed to provision indexes:", idxErr.message);
  }

  // -------------------------------------------------------------
  // STEP 3: Normalize Books Schema Fields
  // -------------------------------------------------------------
  const booksToNormalize = await booksColl
    .find({
      $or: [
        { isDeleted: { $exists: false } },
        { totalCopies: { $exists: false } },
        { availableCopies: { $exists: false } },
      ],
    })
    .toArray();

  for (const book of booksToNormalize) {
    const total = Number(book.copies || book.totalCopies || 5);
    const available = Number(
      book.availableCopies !== undefined ? book.availableCopies : total
    );
    await booksColl.updateOne(
      { _id: book._id },
      {
        $set: {
          isDeleted: book.isDeleted === true,
          totalCopies: Math.max(1, total),
          availableCopies: Math.max(0, available),
          copies: Math.max(1, total),
          available: available > 0,
        },
      }
    );
    migrationResults.booksNormalized++;
  }

  // -------------------------------------------------------------
  // STEP 4: Normalize Borrows Schema Fields
  // -------------------------------------------------------------
  const borrowsToNormalize = await borrowsColl
    .find({
      $or: [
        { quantity: { $exists: false } },
        { status: { $exists: false } },
        { borrowDate: { $exists: false } },
      ],
    })
    .toArray();

  for (const borrow of borrowsToNormalize) {
    await borrowsColl.updateOne(
      { _id: borrow._id },
      {
        $set: {
          quantity: Number(borrow.quantity || 1),
          status: borrow.status || "Active",
          borrowDate:
            borrow.borrowDate ||
            borrow.borrowedAt ||
            borrow.createdAt ||
            new Date().toISOString(),
          returnedAt: borrow.returnedAt || null,
        },
      }
    );
    migrationResults.borrowsNormalized++;
  }

  console.log(
    `[MIGRATION COMPLETE] Books Normalized: ${migrationResults.booksNormalized}, Borrows Normalized: ${migrationResults.borrowsNormalized}`
  );
  return migrationResults;
}

// Standalone execution support
if (process.argv[1]?.endsWith("migrationService.js")) {
  const client = new MongoClient(process.env.MONGODB_URL);
  try {
    await client.connect();
    const db = client.db("assignment-08");
    const result = await runDatabaseMigrations(db);
    console.log("Migration Summary:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Migration execution failed:", err);
  } finally {
    await client.close();
  }
}

