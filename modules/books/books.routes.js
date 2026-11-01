import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import {
  validateBookIdParam,
  validateCreateBook,
  validateUpdateBook,
} from "./books.validator.js";
import {
  getBooks,
  getBookById,
  createBook,
  updateBookHandler,
  deleteBookHandler,
} from "./books.controller.js";

const router = Router();

// 1. Public Endpoints
router.get("/", getBooks);
router.get("/:id", validateBookIdParam, getBookById);

// 2. Protected Endpoints (Requires Authenticated JWT)
router.post("/", authenticate, validateCreateBook, createBook);
router.patch("/:id", authenticate, validateBookIdParam, validateUpdateBook, updateBookHandler);

// 3. Legacy Compatibility Alias (PUT /books/:id maps to canonical update)
router.put("/:id", authenticate, validateBookIdParam, validateUpdateBook, updateBookHandler);

// 4. Soft Deletion
router.delete("/:id", authenticate, validateBookIdParam, deleteBookHandler);

export default router;

