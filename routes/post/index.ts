import { Router } from "express";
import addBookRouter from "./addBook.js";
import borrowBooksRouter from "./borrowBooks.js";

const router = Router();

router.use(addBookRouter);
router.use(borrowBooksRouter);

export default router;

