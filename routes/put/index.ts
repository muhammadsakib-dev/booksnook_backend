import { Router } from "express";
import returnBorrowPutRouter from "./returnBorrowPut.js";
import approveBorrowPutRouter from "./approveBorrowPut.js";

const router = Router();

router.use(returnBorrowPutRouter);
router.use(approveBorrowPutRouter);

export default router;

