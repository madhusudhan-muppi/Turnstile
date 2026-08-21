import jwt from "jsonwebtoken";
import type { AuthUser } from "../types.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-do-not-use-in-prod";

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, JWT_SECRET) as AuthUser;
}
