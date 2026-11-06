// config/env.ts

import "dotenv/config";

const APP_URL = process.env.APP_URL;

const API_URL = process.env.API_URL;

export const ENV = {
  PORT: Number(process.env.PORT) || 8000,
  NODE_ENV: process.env.NODE_ENV,
  APP_URL,
  API_URL,
  MONGODB_URL: process.env.MONGODB_URI,
  DB_NAME: process.env.DB_NAME,
  ALLOWED_ORIGIN: APP_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  TOKEN_ISSUER: APP_URL,
  TOKEN_AUDIENCE: API_URL,
  JWKS_URL: `${APP_URL.replace(/\/+$/, "")}/api/auth/jwks`,
};
