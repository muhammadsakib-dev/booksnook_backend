import { Router } from "express";
import { getDb } from "../../config/db.js";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { AppError } from "../../utils/AppError.js";
const router = Router();
// নতুন বই যোগ করার এপিআই (POST /books)
router.post("/books", authenticate, asyncHandler(async (req, res) => {
    // ১. ফ্রন্টএন্ড থেকে পাঠানো ফিল্ডগুলো সরাসরি ডিস্ট্রাকচার করা
    const { title, author, category, totalCopies, copies, image, rating, description } = req.body || {};
    // ২. পরিষ্কার ভ্যালিডেশন চেকিং
    if (!title || typeof title !== "string" || !title.trim()) {
        throw new AppError("Book title is required", 400, "VALIDATION_ERROR");
    }
    const bookCopies = Number(totalCopies || copies || 1);
    if (isNaN(bookCopies) || bookCopies < 1) {
        throw new AppError("totalCopies must be a positive integer greater than or equal to 1", 400, "VALIDATION_ERROR");
    }
    const now = new Date().toISOString();
    // ৩. ডাটাবেজে সেভ করার জন্য বইয়ের অবজেক্ট তৈরি
    const newBook = {
        title: title.trim(),
        author: (author || "Unknown Author").trim(),
        category: (category || "Fiction").trim(),
        image: image || "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=800",
        rating: Number(rating) || 4.8,
        totalCopies: bookCopies,
        availableCopies: bookCopies,
        copies: bookCopies,
        available: true,
        status: "Available",
        description: (description || "").trim(),
        isDeleted: false,
        ownerUserId: req.user.id,
        addedByName: req.user.name,
        addedByEmail: req.user.email,
        createdAt: now,
        updatedAt: now,
    };
    // ৪. MongoDB ডাটাবেজে সংরক্ষণ করা
    const db = getDb();
    const result = await db.collection("books").insertOne(newBook);
    const createdBook = {
        _id: result.insertedId,
        ...newBook,
    };
    // ৫. সফল রেসপন্স পাঠানো
    return sendSuccess(res, {
        statusCode: 201,
        message: "Book added successfully to library catalog",
        data: createdBook,
        extra: {
            insertedId: createdBook._id,
            book: createdBook,
        },
    });
}));
export default router;
