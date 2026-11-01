# 🛠 BookNook — High-Integrity Library Management API (Backend)

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5.3.0-lightgrey?logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Native_Driver_v7.8-green?logo=mongodb)](https://www.mongodb.com/)
[![Jose](https://img.shields.io/badge/Jose-v6.2-orange)](https://github.com/panva/jose)
[![Tests](https://img.shields.io/badge/Tests-31%2F31_Passing-success)](tests/)

> **BookNook Backend** is an enterprise-grade RESTful API built with **Express 5** and the **MongoDB Native Driver** (no Mongoose). It powers the BookNook community library with atomic concurrency controls, multi-book transaction guarantees, stateless BetterAuth JWT verification, and automated database migrations.

---

## 🏛 Core Architectural Highlights

1. **Native MongoDB Driver (No ORM Bloat)**: Pure, optimized BSON database interactions with indexed queries, explicit projections, and connection pooling.
2. **Atomic Inventory & Transaction Engine**:
   - Multi-book batch checkout within native MongoDB replica set transactions (`client.startSession()`).
   - Non-replica set safe compensation fallback for single-node environments.
   - Atomic conditional stock decrements (`availableCopies >= quantity`).
   - Double-borrow prevention via unique partial database indexes.
3. **Stateless JWT & JWKS Verification**:
   - Cryptographically verifies Bearer tokens issued by the Next.js BetterAuth frontend.
   - Enforces valid cryptographic signatures, token expiration, Issuer (`TOKEN_ISSUER`), and Audience (`TOKEN_AUDIENCE`).
   - Extracts subject (`sub`), email, and name claims directly into `req.user`.
4. **Automated Migration & Index Provisioning**:
   - Automatically provisions partial unique indexes and query indexes on server startup.
   - Normalizes legacy documents without data loss.

---

## 📦 Tech Stack

- **Runtime**: Node.js (ES Modules, `"type": "module"`)
- **Web Framework**: Express.js 5.3.0
- **Database**: MongoDB Native Driver 7.8.0
- **Cryptographic Security**: `jose` 6.2.14 & `jsonwebtoken` 9.0.3
- **Test Runner**: Node.js Built-in Test Runner (`node --test`)

---

## 📂 Backend Directory Structure

```
booksnook_backend/
├── config/
│   ├── db.js                 # MongoDB connection pool & singleton manager
│   └── env.js                # Centralized environment configuration
├── middleware/
│   ├── authenticate.js       # BetterAuth Bearer JWT verification
│   ├── errorHandler.js       # Centralized 404 & error handling
│   └── security.js           # NoSQL injection input sanitization
├── modules/
│   ├── books/                # Books catalog, CRUD & ownership routes
│   │   ├── books.controller.js
│   │   ├── books.routes.js
│   │   ├── books.service.js
│   │   └── books.validator.js
│   └── borrows/              # Borrow reservations & return processing
│       ├── borrows.controller.js
│       ├── borrows.routes.js
│       ├── borrows.service.js
│       └── borrows.validator.js
├── services/
│   ├── inventoryService.js   # Atomic transactions, batch checkouts & returns
│   └── migrationService.js   # Safe index provisioning & data normalizer
├── tests/
│   ├── api.test.js           # Express route & CRUD integration tests
│   ├── e2e_security.test.js  # JWT tampering, concurrency & loan rules
│   └── inventory.test.js     # Stock decrements, rollbacks & batch safety
├── utils/
│   ├── apiResponse.js        # Standardized JSend-style JSON responses
│   ├── AppError.js           # Structured operational error class
│   ├── asyncHandler.js       # Async controller wrapper
│   └── idHelper.js           # Safe ObjectId parser and validator
├── app.js                    # Express app configuration & middleware
├── server.js                 # HTTP listener & graceful shutdown handlers
├── index.js                  # Production entry point
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
| `GET` | `/books` | Public | List catalog books with search, category filtering, and sorting. Excludes soft-deleted books. |
| `GET` | `/books/:id` | Public | Retrieve single book details. Returns 404 if not found or soft-deleted. |
| `POST` | `/books` | Required | Create a new book. Sets `ownerUserId` from JWT and initializes `availableCopies = totalCopies`. |
| `PATCH` | `/books/:id` | Required (Owner) | Update editable fields. Prevents decreasing `totalCopies` below currently loaned copies. |
| `DELETE` | `/books/:id` | Required (Owner) | Soft-deletes a book. **Permanently blocks deletion if active loans exist.** |

### 2. Borrows API (`/borrows`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/borrows` | Required | Retrieve active and historical loan records for the authenticated user only. |
| `POST` | `/borrows` | Required | Checkout one or multiple books atomically with a 14-day loan period. |
| `DELETE` | `/borrows/:id` | Required (Borrower) | Return borrowed book, increment `availableCopies`, and record `returnedAt`. Rejects double returns. |

### 3. System Endpoints

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | Service health status, uptime, and timestamp. |
| `GET` | `/` | Public | Service banner and API version. |
| `GET` | `/inventory/reconcile` | Required | Operational inventory reconciliation report comparing physical copies vs active loans. |

---

## 🧪 Comprehensive Automated Testing

The backend includes 31 unit, concurrency, security, and integration tests covering all business requirements:

```bash
npm test
```

### Test Coverage Highlights:
- **Phase 05 Route Suite**: GET catalog, POST book, PATCH inventory constraints, DELETE active loan guards.
- **Phase 04 Concurrency & Atomic Suite**: Final-copy competition ($1$ copy remaining, $2$ concurrent requests), batch all-or-nothing rollback.
- **Phase 09 Security Suite**: JWT tampering, forged signatures, expired tokens, invalid issuer/audience, reader isolation (User B cannot see or return User A's loans).
- **Date Calculation Suite**: Exact 14 calendar days due date calculation and status conditions (*Active*, *Due Today*, *Overdue*).

---

## 🚀 Getting Started Locally

### 1. Install Dependencies
```bash
cd booksnook_backend
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Set your local values:
```env
PORT=8000
NODE_ENV=development
MONGODB_URL=mongodb+srv://<user>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
DB_NAME=assignment-08
ALLOWED_ORIGIN=http://localhost:3000
BETTER_AUTH_SECRET=your_32_character_jwt_secret_matching_frontend
TOKEN_ISSUER=http://localhost:3000
TOKEN_AUDIENCE=http://localhost:8000
```

### 3. Start the Server
```bash
npm start
```
The server will connect to MongoDB, verify indexes, and listen at [http://localhost:8000](http://localhost:8000).

---

## 🌐 Production Deployment (Render)

1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your GitHub backend repository.
3. Configuration:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Set Environment Variables on Render:
   - `NODE_ENV`: `production`
   - `MONGODB_URL`: Your MongoDB Atlas connection URI.
   - `DB_NAME`: `assignment-08`
   - `BETTER_AUTH_SECRET`: The exact same secret configured on Vercel.
   - `ALLOWED_ORIGIN`: Your frontend Vercel URL (e.g. `https://booknook-client.vercel.app`).
   - `TOKEN_ISSUER`: Your frontend BetterAuth URL (e.g. `https://booknook-client.vercel.app`).
   - `TOKEN_AUDIENCE`: Your Render backend URL (e.g. `https://booknook-api.onrender.com`).
5. Render will automatically expose `PORT` and route traffic to your service. Verify using `GET /health`.
