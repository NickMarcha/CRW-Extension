import type { Request, Response, NextFunction } from "express";
import { validateToken } from "./tokens.js";

export function requireToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    console.log("[match] 401: missing Authorization header");
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = auth.slice(7);
  validateToken(token).then((valid) => {
    if (!valid) {
      console.log("[match] 401: invalid token");
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    next();
  }).catch((err) => {
    console.error("[match] token validation error:", err);
    res.status(500).json({ error: "Internal server error" });
  });
}
