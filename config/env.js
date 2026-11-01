import "dotenv/config";

/**
 * Centralized Environment Configuration
 * Supports production Render hosting, multi-environment origins, and BetterAuth JWT specs.
 */
export const ENV = {
  PORT: process.env.PORT || 8000,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URL:
    process.env.MONGODB_URL ||
    "mongodb+srv://admin:pass@cluster.mongodb.net/assignment-08?retryWrites=true&w=majority",
  DB_NAME: process.env.DB_NAME || "assignment-08",
  ALLOWED_ORIGIN:
    process.env.ALLOWED_ORIGIN ||
    process.env.FRONTEND_URL ||
    "http://localhost:3000",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ||
    "booknook_super_secure_jwt_secret_32_chars_key_2026!",
  TOKEN_ISSUER:
    process.env.TOKEN_ISSUER ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000",
  TOKEN_AUDIENCE:
    process.env.TOKEN_AUDIENCE ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000",
  JWKS_URL:
    process.env.JWKS_URL ||
    `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/auth/jwks`,
};
