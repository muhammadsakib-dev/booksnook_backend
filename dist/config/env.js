import "dotenv/config";
export const ENV = {
    PORT: process.env.PORT || 8000,
    NODE_ENV: process.env.NODE_ENV || "development",
    MONGODB_URL: process.env.MONGODB_URL || "",
    DB_NAME: process.env.DB_NAME || "assignment-08",
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || "http://localhost:3000",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "booknook_super_secure_jwt_secret_32_chars_key_2026!",
    TOKEN_ISSUER: process.env.TOKEN_ISSUER || "http://localhost:3000",
    TOKEN_AUDIENCE: process.env.TOKEN_AUDIENCE || "http://localhost:8000",
    JWKS_URL: process.env.JWKS_URL || "http://localhost:3000/api/auth/jwks",
};
