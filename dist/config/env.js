// config/env.ts
import "dotenv/config";
const rawAppUrl = process.env.APP_URL || "http://localhost:3000";
const rawApiUrl = process.env.API_URL || "http://localhost:8000";
const APP_URL = rawAppUrl.replace(/\/+$/, "");
const API_URL = rawApiUrl.replace(/\/+$/, "");
export const ENV = {
    PORT: Number(process.env.PORT) || 8000,
    NODE_ENV: process.env.NODE_ENV || "development",
    APP_URL,
    API_URL,
    MONGODB_URL: process.env.MONGODB_URI || process.env.MONGODB_URL || "mongodb://localhost:27017/assignment-08",
    DB_NAME: process.env.DB_NAME || "assignment-08",
    ALLOWED_ORIGIN: APP_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "",
    TOKEN_ISSUER: APP_URL,
    TOKEN_AUDIENCE: API_URL,
    JWKS_URL: `${APP_URL}/api/auth/jwks`,
};
