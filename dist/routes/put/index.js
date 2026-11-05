import { Router } from "express";
import updateBookPutRouter from "./updateBookPut.js";
import returnBorrowPutRouter from "./returnBorrowPut.js";
const router = Router();
router.use(updateBookPutRouter);
router.use(returnBorrowPutRouter);
export default router;
