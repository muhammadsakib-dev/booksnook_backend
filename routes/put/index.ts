import { Router } from "express";
import updateBookPutRouter from "./updateBookPut.js";
import returnBorrowPutRouter from "./returnBorrowPut.js";
import approveBorrowPutRouter from "./approveBorrowPut.js";

const router = Router();

router.use(updateBookPutRouter);
router.use(returnBorrowPutRouter);
router.use(approveBorrowPutRouter);

export default router;

