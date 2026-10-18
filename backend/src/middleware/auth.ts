import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";

const cookieName = "recoverx_session";
export function setSessionCookie(res: Response, userId: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
  const token = jwt.sign({ sub: userId }, secret, { expiresIn: "7d", issuer: "recoverx-api" });
  res.cookie(cookieName, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
    sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 * 1000
  });
}
export function clearSessionCookie(res: Response) {
  res.clearCookie(cookieName, { httpOnly: true, secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true", sameSite: "lax", path: "/" });
}
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[cookieName];
    if (!token) return res.status(401).json({ error: "Please sign in to continue." });
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) return res.status(500).json({ error: "Server authentication is not configured." });
    const payload = jwt.verify(token, secret, { issuer: "recoverx-api" }) as jwt.JwtPayload;
    if (!payload.sub || typeof payload.sub !== "string") return res.status(401).json({ error: "Session is invalid." });
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, name: true } });
    if (!user) return res.status(401).json({ error: "Session is no longer valid." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Your session expired. Please sign in again." });
  }
}
