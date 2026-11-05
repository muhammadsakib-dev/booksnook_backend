import { Router } from "express";
import deleteBookRouter from "./deleteBook.js";
import returnBorrowDeleteRouter from "./returnBorrowDelete.js";
const router = Router();
router.use(deleteBookRouter);
router.use(returnBorrowDeleteRouter);
export default router;
