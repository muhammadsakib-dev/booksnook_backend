import { Router } from "express";
import updateBookRouter from "./updateBook.js";
const router = Router();
router.use(updateBookRouter);
export default router;
