import { Request, Response, NextFunction } from "express";
import * as jose from "jose";
import { ENV } from "../config/env.js";

// Express Request-এ user প্রপার্টি যুক্ত করা
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
      };
    }
  }
}

const verificationKey = ENV.JWKS_URL
  ? jose.createRemoteJWKSet(new URL(ENV.JWKS_URL))
  : new TextEncoder().encode(ENV.BETTER_AUTH_SECRET);

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
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

    let payload: jose.JWTPayload;

    try {
      const result = await jose.jwtVerify(token, verificationKey, {
        issuer: ENV.TOKEN_ISSUER,
        audience: ENV.TOKEN_AUDIENCE,
      });
      payload = result.payload;
    } catch (jwksErr: any) {
      if (ENV.BETTER_AUTH_SECRET) {
        try {
          const secretKey = new TextEncoder().encode(ENV.BETTER_AUTH_SECRET);
          const result = await jose.jwtVerify(token, secretKey, {
            issuer: ENV.TOKEN_ISSUER,
            audience: ENV.TOKEN_AUDIENCE,
          });
          payload = result.payload;
        } catch {
          throw jwksErr;
        }
      } else {
        throw jwksErr;
      }
    }

    req.user = {
      id: String(payload.sub),
      email: (payload.email as string) || "",
      name: (payload.name as string) || ((payload.email as string)?.split("@")[0] || "Reader"),
      role: (payload.role as string) || "reader",
    };

    return next();
  } catch (error: any) {
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

