# 🛠 BookNook — High-Integrity Community Library Backend API

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5.3.0-lightgrey?logo=express)](https://expressjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-ES2022-blue?logo=typescript)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Native_Driver_v7.8-green?logo=mongodb)](https://www.mongodb.com/)
[![Jose](https://img.shields.io/badge/Jose-v6.2-orange)](https://github.com/panva/jose)

> **BookNook Backend** is an enterprise-grade RESTful API built with **Express 5**, **TypeScript**, and the **MongoDB Native Driver** (no Mongoose). It powers the BookNook community library with atomic concurrency controls, peer-to-peer borrow approvals, stateless BetterAuth JWT verification, and automated database safeguards.

---

## 🏛 Core Architectural Highlights

1. **Native MongoDB Driver (No ORM Bloat)**: Pure, optimized BSON database interactions with indexed queries, explicit projections, connection pooling, and zero Mongoose overhead.
2. **Atomic Inventory & Concurrency Engine**:
   - Atomic conditional stock decrements (`availableCopies: { $gte: quantity }`).
   - Duplicate active loan prevention (`status: { $in: ["Active", "Pending", "Return Pending"] }`).
   - Contributor inventory boundary guards: `totalCopies` cannot be reduced below books currently held by readers.
   - In-flight deletion guards: Books cannot be deleted while active or pending loans exist.
3. **Stateless JWT & JWKS Verification**:
   - Cryptographically verifies Bearer tokens issued by the Next.js BetterAuth frontend using `jose`.
   - Supports remote JWKS fetching with seamless fallback to symmetric secret verification (`BETTER_AUTH_SECRET`).
   - Populates `req.user = { id, email, name, role }` across all authenticated endpoints.
4. **Production-Ready Multi-Environment Support**:
   - Graceful shutdown listeners (`SIGINT`, `SIGTERM`) for zero-downtime server updates.
   - Built-in `vercel.json` for serverless deployment on Vercel.
   - Compiled JavaScript output in `dist/` for production Node.js environments (Render, Railway, VPS).

---

## 📦 Tech Stack

- **Runtime**: Node.js (ES Modules, `"type": "module"`)
- **Language**: TypeScript (`tsconfig.json`, target: `ES2022`, module: `NodeNext`)
- **Web Framework**: Express.js `5.3.0`
- **Database Driver**: MongoDB Native Driver `7.8.0`
- **Cryptographic Security**: `jose` `6.2.14`
- **Development Tooling**: `tsx` (TypeScript Execute)

---

## 📂 Backend Directory Structure

```
booksnook_backend/
├── config/
│   ├── db.ts                 # MongoDB connection pool, caching & graceful close
│   └── env.ts                # Sanitized environment configuration with safe fallbacks
├── middleware/
│   ├── authenticate.ts       # Stateless BetterAuth Bearer JWT verification
│   ├── errorHandler.ts       # Centralized 404 & structured error handler
│   └── security.ts           # NoSQL operator injection sanitizer
├── routes/
│   ├── get/                  # GET endpoints (catalog, book details, borrows, health)
│   │   ├── getBooks.ts
│   │   ├── getBookById.ts
│   │   ├── getBorrows.ts
│   │   └── getHealth.ts
│   ├── post/                 # POST endpoints (add book, batch borrow request)
│   │   ├── addBook.ts
│   │   └── borrowBooks.ts
│   ├── patch/                # PATCH & PUT endpoints (update book details)
│   │   └── updateBook.ts
│   ├── put/                  # PUT endpoints (P2P approval, decline, return workflows)
│   │   ├── approveBorrowPut.ts
│   │   └── returnBorrowPut.ts
│   └── delete/               # DELETE endpoints (safe soft-delete)
│       └── deleteBook.ts
├── services/
│   └── inventoryService.ts   # Core business logic: atomic loans, approvals & bounds
├── utils/
│   ├── apiResponse.ts        # Standardized JSend JSON envelopes
│   ├── AppError.ts           # Operational error class
│   ├── asyncHandler.ts       # Express async route wrapper
│   ├── idHelper.ts           # Safe ObjectId and query helper
│   └── parseBookUpdate.ts    # Update body validator and sanitizer
├── dist/                     # Compiled production JavaScript files
├── index.ts                  # Main Express entry point with CORS & graceful shutdown
├── vercel.json               # Vercel serverless deployment configuration
├── tsconfig.json             # TypeScript compiler configuration
└── package.json
```

---

## 📡 API Specification & Endpoints

All responses adhere to the standard BookNook API contract:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### 1. Books API (`/books`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/books` | Public | List catalog books with search, category filtering, multi-criterion sorting, and pagination. |
| `GET` | `/books/:id` | Public | Retrieve single book details. Returns 404 if not found or soft-deleted. |
| `POST` | `/books` | Required | Create a new book. Sets `ownerUserId` from JWT and initializes available shelf copies. |
| `PATCH` | `/books/:id` | Required (Owner) | Update editable fields with active loan inventory lower-bound guard. |
| `DELETE` | `/books/:id` | Required (Owner) | Soft-delete a book. Blocked if any pending or active loans exist. |

### 2. Peer-to-Peer (P2P) Borrowing & Approvals (`/borrows`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/borrows` | Required | List logged-in user's active, pending, or returned loans. |
| `GET` | `/borrows?role=owner` | Required | List incoming borrow requests and return approvals for contributor's books. |
| `POST` | `/borrows` | Required | Submit a borrow request (single or multi-book batch). Reserves copies conditionally. |
| `PUT` | `/borrows/:id/approve` | Required (Contributor) | Approve a pending borrow request. Activates 14-day loan window. |
| `PUT` | `/borrows/:id/reject` | Required (Contributor/Borrower) | Decline (contributor) or cancel (borrower) request. Restores reserved copies. |
| `PUT` | `/borrows/:id/request-return` | Required (Borrower) | Initiate return request. Marks loan as `Return Pending`. |
| `PUT` | `/borrows/:id/approve-return` | Required (Contributor) | Confirm physical receipt of book. Marks as `Returned` and restores shelf stock. |

### 3. System & Health

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Public | Service heartbeat and version banner. |
| `GET` | `/health` | Public | Health status, server uptime, and timestamp. |

---

## ⚙️ Environment Variables

Create a `.env` file in the `booksnook_backend` root directory (see `.env.example`):

```env
PORT=8000
NODE_ENV=development
API_URL=http://localhost:8000
APP_URL=http://localhost:3000
BETTER_AUTH_SECRET=A6aErmnfAplYP1ZxrLMyAPzbsRlzcbTr
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.p16xpfx.mongodb.net/
DB_NAME=assignment-08
```

---

## 🚀 Running Locally & Production Build

```bash
# 1. Install dependencies
npm install

# 2. Run in development mode (hot-reload via tsx)
npm run dev

# 3. Compile TypeScript for production
npm run build

# 4. Start production server (runs compiled dist/index.js)
npm run start
```
