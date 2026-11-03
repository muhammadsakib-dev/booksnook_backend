import * as jose from "jose";
import { ENV } from "../config/env.js";

// JWT Verify Secret Key Configuration
const verificationKey = ENV.JWKS_URL
  ? jose.createRemoteJWKSet(new URL(ENV.JWKS_URL))
  : new TextEncoder().encode(ENV.BETTER_AUTH_SECRET);

/**
 * User Authentication Middleware
 */

export async function authenticate(req, res, next) {
  try {
    // ১. Authorization হেডার থেকে Bearer টোকেন নেওয়া
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required",
        error: { code: "UNAUTHORIZED" },
      });
    }

    // ২. সিক্রেট কি দিয়ে JWT টোকেন ভেরিফাই করা
    const { payload } = await jose.jwtVerify(token, verificationKey, {
      issuer: ENV.TOKEN_ISSUER,
      audience: ENV.TOKEN_AUDIENCE,
    });

    // ৩. টোকেন থেকে প্রয়োজনীয় ইউজারের তথ্য req.user-এ রাখা
    req.user = {
      id: payload.sub,
      email: payload.email || "",
      name: payload.name || payload.email?.split("@")[0] || "Reader",
      role: payload.role || "reader",
    };

    // ৪. অনুমোদন সম্পন্ন, পরবর্তী কন্ট্রোলারে পাঠানো
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        error.code === "ERR_JWT_EXPIRED"
          ? "Session expired. Please login again."
          : "Invalid or unauthorized token",
      error: { code: error.code || "UNAUTHORIZED" },
    });
  }
}
