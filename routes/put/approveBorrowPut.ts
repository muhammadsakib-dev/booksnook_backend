import { Router, Request, Response } from "express";
import { getDb } from "../../config/db.js";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { AppError } from "../../utils/AppError.js";
import { isValidObjectId } from "../../utils/idHelper.js";
import {
  approveBorrowRequest,
  rejectBorrowRequest,
  requestReturn,
  approveReturn,
} from "../../services/inventoryService.js";

const router = Router();

function validateBorrowId(id: string) {
  if (!id || typeof id !== "string" || !id.trim()) {
    throw new AppError("Borrow ID parameter is required", 400, "INVALID_ID");
  }
  if (id.length === 24 && !isValidObjectId(id)) {
    throw new AppError("Malformed ObjectId parameter", 400, "INVALID_ID");
  }
}

// 1. Approve Borrow Request (PUT /borrows/:id/approve)
router.put(
  "/borrows/:id/approve",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    validateBorrowId(id);

    const db = getDb();
    const result = await approveBorrowRequest({
      db,
      user: req.user,
      borrowId: id,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Borrow request approved successfully. Loan is now active.",
      data: result,
      extra: result,
    });
  })
);

// 2. Reject or Cancel Borrow Request (PUT /borrows/:id/reject)
router.put(
  "/borrows/:id/reject",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    validateBorrowId(id);

    const { reason } = req.body || {};
    const db = getDb();
    const result = await rejectBorrowRequest({
      db,
      user: req.user,
      borrowId: id,
      reason,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Borrow request resolved. Reserved inventory restored.",
      data: result,
      extra: result,
    });
  })
);

// 3. Request Return (PUT /borrows/:id/request-return)
router.put(
  "/borrows/:id/request-return",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    validateBorrowId(id);

    const db = getDb();
    const result = await requestReturn({
      db,
      user: req.user,
      borrowId: id,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Book return submitted. Waiting for contributor confirmation.",
      data: result,
      extra: result,
    });
  })
);

// 4. Confirm Return Received (PUT /borrows/:id/approve-return)
router.put(
  "/borrows/:id/approve-return",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    validateBorrowId(id);

    const db = getDb();
    const result = await approveReturn({
      db,
      user: req.user,
      borrowId: id,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Return confirmed successfully. Book copies restored to catalog.",
      data: result,
      extra: result,
    });
  })
);

export default router;
