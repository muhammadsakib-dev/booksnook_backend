import * as jose from "jose";
import { ENV } from "../config/env.js";

let remoteJWKS = null;
try {
  if (ENV.JWKS_URL) {
    remoteJWKS = jose.createRemoteJWKSet(new URL(ENV.JWKS_URL));
  }
} catch (_) {}

/**
 * ইউজার ভেরিফিকেশন মিডলওয়্যার (BetterAuth JWT)
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authorization header with Bearer token is required",
        },
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Token is empty or malformed",
        },
      });
    }

    let verifiedPayload = null;

    // ১. রিমোট JWKS দিয়ে যাচাইয়ের চেষ্টা
    if (remoteJWKS) {
      try {
        const { payload } = await jose.jwtVerify(token, remoteJWKS, {
          issuer: ENV.TOKEN_ISSUER,
          audience: ENV.TOKEN_AUDIENCE,
        });
        verifiedPayload = payload;
      } catch (_) {}
    }

    // ২. সিমেট্রিক সিক্রেট কি দিয়ে যাচাই (Secret Key)
    if (!verifiedPayload) {
      const secretKey = new TextEncoder().encode(ENV.BETTER_AUTH_SECRET);
      const { payload } = await jose.jwtVerify(token, secretKey, {
        issuer: ENV.TOKEN_ISSUER,
        audience: ENV.TOKEN_AUDIENCE,
      });
      verifiedPayload = payload;
    }

    // ৩. টোকেনে sub (User ID) আছে কি না চেক
    if (!verifiedPayload.sub) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "JWT subject (sub) claim is missing",
        },
      });
    }

    // ৪. ইউজার অবজেক্ট রিকোয়েস্টে যুক্ত করা
    req.user = {
      id: String(verifiedPayload.sub),
      email: verifiedPayload.email || "",
      name: verifiedPayload.name || verifiedPayload.email?.split("@")[0] || "User",
      role: verifiedPayload.role || "reader",
    };

    next();
  } catch (err) {
    let errorCode = "UNAUTHORIZED";
    let message = "Invalid or expired token";

    if (err.code === "ERR_JWT_EXPIRED") {
      errorCode = "TOKEN_EXPIRED";
      message = "Session token has expired. Please refresh or re-login.";
    } else if (err.code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
      errorCode = "INVALID_TOKEN_CLAIMS";
      message = `Claim validation failed: ${err.message}`;
    }

    return res.status(401).json({
      success: false,
      error: {
        code: errorCode,
        message,
      },
    });
  }
}
