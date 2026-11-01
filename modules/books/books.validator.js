import { AppError } from "../../utils/AppError.js";
import { isValidObjectId } from "../../utils/idHelper.js";

/**
 * Validates URL string format
 */
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

/**
 * Validates Book ID parameter
 */
export function validateBookIdParam(req, res, next) {
  const { id } = req.params;
  if (!id || typeof id !== "string" || !id.trim()) {
    return next(new AppError("Book ID parameter is required", 400, "INVALID_ID"));
  }

  // If 24 hex characters, verify valid ObjectId format
  if (id.length === 24 && !isValidObjectId(id)) {
    return next(new AppError("Malformed ObjectId parameter", 400, "INVALID_ID"));
  }

  next();
}

/**
 * Validates Book Creation Payload (POST /books)
 */
export function validateCreateBook(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object") {
    return next(new AppError("Request body must be a valid JSON object", 400, "VALIDATION_ERROR"));
  }

  const title = (body.title || body.bookTitle || body.name || "").trim();
  if (!title) {
    return next(new AppError("Book title is required", 400, "VALIDATION_ERROR"));
  }

  if (title.length > 250) {
    return next(new AppError("Book title cannot exceed 250 characters", 400, "VALIDATION_ERROR"));
  }

  const author = (body.author || body.authorName || "Unknown Author").trim();
  const category = (body.category || body.genre || "Fiction").trim();

  // Validate copy counts
  const rawCopies = body.copies !== undefined ? body.copies : (body.totalCopies !== undefined ? body.totalCopies : body.quantity);
  const totalCopies = rawCopies !== undefined ? Number(rawCopies) : 1;

  if (isNaN(totalCopies) || !Number.isInteger(totalCopies) || totalCopies < 1) {
    return next(new AppError("totalCopies must be a positive integer greater than or equal to 1", 400, "VALIDATION_ERROR"));
  }

  // Validate image URL if provided
  const image = body.image || body.coverImage || body.imageUrl;
  if (image && typeof image === "string" && !isValidUrl(image) && !image.startsWith("/")) {
    return next(new AppError("Image must be a valid HTTP/HTTPS URL", 400, "VALIDATION_ERROR"));
  }

  // Validate rating if provided
  if (body.rating !== undefined) {
    const rating = Number(body.rating);
    if (isNaN(rating) || rating < 0 || rating > 5) {
      return next(new AppError("Rating must be a numeric value between 0 and 5", 400, "VALIDATION_ERROR"));
    }
  }

  // Sanitize and attach validated book object to request
  req.validatedBook = {
    title,
    author,
    category,
    totalCopies,
    image: image || "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=800",
    rating: body.rating !== undefined ? Number(body.rating) : 4.8,
    description: typeof body.description === "string" ? body.description.trim() : "",
  };

  next();
}

/**
 * Validates Book Update Payload (PATCH & PUT /books/:id)
 */
export function validateUpdateBook(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object") {
    return next(new AppError("Request body must be a valid JSON object", 400, "VALIDATION_ERROR"));
  }

  const patch = {};

  // Title
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) {
      return next(new AppError("Book title cannot be empty", 400, "VALIDATION_ERROR"));
    }
    patch.title = title;
  }

  // Author
  if (body.author !== undefined) {
    patch.author = String(body.author).trim() || "Unknown Author";
  }

  // Category
  if (body.category !== undefined) {
    patch.category = String(body.category).trim() || "Fiction";
  }

  // Copies / TotalCopies
  if (body.totalCopies !== undefined || body.copies !== undefined) {
    const val = Number(body.totalCopies !== undefined ? body.totalCopies : body.copies);
    if (isNaN(val) || !Number.isInteger(val) || val < 1) {
      return next(new AppError("totalCopies must be a positive integer greater than or equal to 1", 400, "VALIDATION_ERROR"));
    }
    patch.totalCopies = val;
    patch.copies = val;
  }

  // AvailableCopies
  if (body.availableCopies !== undefined) {
    const val = Number(body.availableCopies);
    if (isNaN(val) || !Number.isInteger(val) || val < 0) {
      return next(new AppError("availableCopies cannot be negative", 400, "VALIDATION_ERROR"));
    }
    patch.availableCopies = val;
    patch.available = val > 0;
    patch.status = val > 0 ? "Available" : "Unavailable";
  }

  // Image
  if (body.image !== undefined) {
    const img = String(body.image).trim();
    if (img && !isValidUrl(img) && !img.startsWith("/")) {
      return next(new AppError("Image must be a valid HTTP/HTTPS URL", 400, "VALIDATION_ERROR"));
    }
    patch.image = img;
  }

  // Rating
  if (body.rating !== undefined) {
    const rating = Number(body.rating);
    if (isNaN(rating) || rating < 0 || rating > 5) {
      return next(new AppError("Rating must be a numeric value between 0 and 5", 400, "VALIDATION_ERROR"));
    }
    patch.rating = rating;
  }

  // Description
  if (body.description !== undefined) {
    patch.description = String(body.description).trim();
  }

  // Prevent modifying internal protected fields
  delete patch._id;
  delete patch.ownerUserId;
  delete patch.isDeleted;
  delete patch.createdAt;

  req.validatedUpdate = patch;
  next();
}

