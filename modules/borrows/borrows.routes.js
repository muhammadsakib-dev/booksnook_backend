import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import {
  validateBorrowIdParam,
  validateBorrowRequest,
} from "./borrows.validator.js";
import {
  getBorrows,
  createBorrow,
  returnBorrow,
} from "./borrows.controller.js";

const router = Router();

// All borrow operations require authentication
router.use(authenticate);

// 1. Fetch Reader's Own Borrows
router.get("/", getBorrows);

// 2. Checkout Borrow Loans (Single or Multi-item Batch)
router.post("/", validateBorrowRequest, createBorrow);

// 3. Return Book (Canonical DELETE /borrows/:id)
router.delete("/:id", validateBorrowIdParam, returnBorrow);

// 4. Legacy Compatibility Alias (PUT /borrows/:id/return maps to returnBorrow)
router.put("/:id/return", validateBorrowIdParam, returnBorrow);

export default router;

