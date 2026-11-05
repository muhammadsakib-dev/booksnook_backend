import { AppError } from "./AppError.js";

/**
 * Validates and sanitizes book update payload for PATCH and PUT requests.
 * Directly matches frontend fields: title, author, category, totalCopies, copies, availableCopies, image, rating, description.
 */
export function parseBookUpdateBody(body: any): Record<string, any> {
  if (!body || typeof body !== "object") {
    throw new AppError("Request body must be a valid JSON object", 400, "VALIDATION_ERROR");
  }

  const patch: Record<string, any> = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) {
      throw new AppError("Book title cannot be empty", 400, "VALIDATION_ERROR");
    }
    patch.title = title;
  }

  if (body.author !== undefined) {
    patch.author = String(body.author).trim() || "Unknown Author";
  }

  if (body.category !== undefined) {
    patch.category = String(body.category).trim() || "Fiction";
  }

  if (body.totalCopies !== undefined || body.copies !== undefined) {
    const val = Number(body.totalCopies !== undefined ? body.totalCopies : body.copies);
    if (isNaN(val) || !Number.isInteger(val) || val < 1) {
      throw new AppError("totalCopies must be a positive integer greater than or equal to 1", 400, "VALIDATION_ERROR");
    }
    patch.totalCopies = val;
    patch.copies = val;
  }

  if (body.availableCopies !== undefined) {
    const val = Number(body.availableCopies);
    if (isNaN(val) || !Number.isInteger(val) || val < 0) {
      throw new AppError("availableCopies cannot be negative", 400, "VALIDATION_ERROR");
    }
    patch.availableCopies = val;
    patch.available = val > 0;
    patch.status = val > 0 ? "Available" : "Unavailable";
  }

  if (body.image !== undefined) {
    patch.image = String(body.image).trim();
  }

  if (body.rating !== undefined) {
    const rating = Number(body.rating);
    if (isNaN(rating) || rating < 0 || rating > 5) {
      throw new AppError("Rating must be a numeric value between 0 and 5", 400, "VALIDATION_ERROR");
    }
    patch.rating = rating;
  }

  if (body.description !== undefined) {
    patch.description = String(body.description).trim();
  }

  // Prevent overriding immutable fields
  delete patch._id;
  delete patch.ownerUserId;
  delete patch.isDeleted;
  delete patch.createdAt;

  return patch;
}

