import * as jose from "jose";
import { ENV } from "../config/env.js";

const JWT_SECRET = ENV.BETTER_AUTH_SECRET;
const ISSUER = ENV.TOKEN_ISSUER;
const AUDIENCE = ENV.TOKEN_AUDIENCE;
const JWKS_URL = ENV.JWKS_URL;

let remoteJWKS = null;
try {
  remoteJWKS = jose.createRemoteJWKSet(new URL(JWKS_URL));
} catch (e) {
  console.warn("Could not initialize remote JWKS set, using secret key:", e.message);
}

/**
 * Express Authentication Middleware
 * Validates Bearer JWT issued by BetterAuth before granting access to protected routes.
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

    // 1. Try remote JWKS if available
    if (remoteJWKS) {
      try {
        const { payload } = await jose.jwtVerify(token, remoteJWKS, {
          issuer: ISSUER,
          audience: AUDIENCE,
        });
        verifiedPayload = payload;
      } catch (jwksErr) {
        // Fallback to symmetric secret verification if JWKS didn't match
      }
    }

    // 2. Fallback to symmetric secret key verification
    if (!verifiedPayload) {
      const secretKey = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secretKey, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      verifiedPayload = payload;
    }

    // 3. Ensure subject exists
    if (!verifiedPayload.sub) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "JWT subject (sub) claim is missing",
        },
      });
    }

    // 4. Attach verified user context to request
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

