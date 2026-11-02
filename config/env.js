import "dotenv/config";

/**
 * সেন্ট্রাল এনভায়রনমেন্ট কনফিগারেশন
 * সরাসরি .env ফাইল থেকে ভ্যালুগুলো রিড করা হচ্ছে (কোনো অতিরিক্ত || ফলব্যাক ছাড়া)
 */
export const ENV = {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  MONGODB_URL: process.env.MONGODB_URL,
  DB_NAME: process.env.DB_NAME,
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  TOKEN_ISSUER: process.env.TOKEN_ISSUER,
  TOKEN_AUDIENCE: process.env.TOKEN_AUDIENCE,
  JWKS_URL: process.env.JWKS_URL,
};
