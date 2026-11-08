import { Router } from "express";
import { getDb } from "../../config/db.js";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { AppError } from "../../utils/AppError.js";
import { isValidObjectId } from "../../utils/idHelper.js";
import { returnBook } from "../../services/inventoryService.js";
const router = Router();
// Return borrowed book (PUT /borrows/:id/return)
router.put("/borrows/:id/return", authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id || typeof id !== "string" || !id.trim()) {
        throw new AppError("Borrow ID parameter is required", 400, "INVALID_ID");
    }
    if (id.length === 24 && !isValidObjectId(id)) {
        throw new AppError("Malformed ObjectId parameter", 400, "INVALID_ID");
    }
    const db = getDb();
    const result = await returnBook({
        db,
        user: req.user,
        borrowId: id,
    });
    return sendSuccess(res, {
        statusCode: 200,
        message: "Book returned successfully. Inventory updated.",
        data: result,
    });
}));
export default router;
