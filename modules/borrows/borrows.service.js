import { borrowBooks, returnBook } from "../../services/inventoryService.js";

/**
 * Service: Fetch Borrow Records Scoped to Authenticated User
 */
export async function getReaderBorrows(db, user, { status }) {
  const borrowsCollection = db.collection("borrows");

  // Security Invariant: Readers can only retrieve their own borrow records
  const query = { userId: user.id };

  if (status && status !== "all") {
    query.status = status;
  }

  const borrows = await borrowsCollection
    .find(query)
    .sort({ borrowedAt: -1, createdAt: -1 })
    .toArray();

  return borrows;
}

/**
 * Service: Execute Transactional Borrow Checkout (Single or Batch Borrow Bag)
 */
export async function checkoutBooks(client, db, user, items) {
  return await borrowBooks({
    client,
    db,
    user,
    items,
  });
}

/**
 * Service: Execute Transactional Book Return (Exact Quantity Restoration)
 */
export async function returnBookLoan(client, db, user, borrowId) {
  return await returnBook({
    client,
    db,
    user,
    borrowId,
  });
}

