import * as jose from "jose";
import { ENV } from "../config/env.js";
const verificationKey = ENV.JWKS_URL
    ? jose.createRemoteJWKSet(new URL(ENV.JWKS_URL))
    : new TextEncoder().encode(ENV.BETTER_AUTH_SECRET);
export async function authenticate(req, res, next) {
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
        const { payload } = await jose.jwtVerify(token, verificationKey, {
            issuer: ENV.TOKEN_ISSUER,
            audience: ENV.TOKEN_AUDIENCE,
        });
        req.user = {
            id: String(payload.sub),
            email: payload.email || "",
            name: payload.name || (payload.email?.split("@")[0] || "Reader"),
            role: payload.role || "reader",
        };
        return next();
    }
    catch (error) {
        return res.status(401).json({
            success: false,
            message: error.code === "ERR_JWT_EXPIRED"
                ? "Session expired. Please login again."
                : "Invalid or unauthorized token",
            error: { code: error.code || "UNAUTHORIZED" },
        });
    }
}
