import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  traineeId: string | null;
  isConnector: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const CONNECTOR_KEY = process.env.COPILOT_CONNECTOR_API_KEY;

if (!ACCESS_SECRET) {
  throw new Error("JWT_ACCESS_SECRET is not set");
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  traineeId: string | null;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET as string, { expiresIn: "15m" });
}

export function signRefreshToken(payload: AccessTokenPayload): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET is not set");
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyRefreshToken(token: string): AccessTokenPayload {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET is not set");
  return jwt.verify(token, secret) as AccessTokenPayload;
}

// Authenticates either a human JWT (Authorization: Bearer) or the Copilot
// Studio connector's own API key (x-connector-key). The connector is treated
// as its own client with MANAGER-equivalent permissions, never as a human's JWT.
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const connectorKey = req.header("x-connector-key");
  if (connectorKey) {
    if (!CONNECTOR_KEY || connectorKey !== CONNECTOR_KEY) {
      return res.status(401).json({ error: "Unauthorized", message: "Invalid connector key" });
    }
    req.user = {
      id: "copilot-connector",
      email: "copilot-connector@onboardai.internal",
      role: UserRole.MANAGER,
      traineeId: null,
      isConnector: true,
    };
    return next();
  }

  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized", message: "Missing bearer token" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, ACCESS_SECRET as string) as AccessTokenPayload;
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      traineeId: payload.traineeId,
      isConnector: false,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized", message: "Invalid or expired token" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden", message: "Insufficient role" });
    }
    next();
  };
}
