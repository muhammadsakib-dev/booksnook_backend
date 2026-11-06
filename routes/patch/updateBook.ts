import { Router, Request, Response } from "express";
import { getDb } from "../../config/db.js";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { AppError } from "../../utils/AppError.js";
import { isValidObjectId } from "../../utils/idHelper.js";
import { updateBook } from "../../services/inventoryService.js";
import { parseBookUpdateBody } from "../../utils/parseBookUpdate.js";

const router = Router();

// Handler for updating book details
const handleUpdateBook = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    throw new AppError("Book ID parameter is required", 400, "INVALID_ID");
  }
  if (id.length === 24 && !isValidObjectId(id)) {
    throw new AppError("Malformed ObjectId parameter", 400, "INVALID_ID");
  }

  const updateData = parseBookUpdateBody(req.body);
  const db = getDb();

  const result = await updateBook({
    db,
    user: req.user,
    bookId: id,
    updateData,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "Book updated successfully",
    data: result,
  });
});

// Support both PATCH and PUT on /books/:id
router
  .route("/books/:id")
  .patch(authenticate, handleUpdateBook)
  .put(authenticate, handleUpdateBook);

export default router;

