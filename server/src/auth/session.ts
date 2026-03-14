import session from "express-session";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.warn(
    "ADMIN_PASSWORD not set. Admin login will not work. Set it in environment.",
  );
}

export function checkAdminCredentials(
  username: string,
  password: string,
): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "crw-admin-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
});

export function requireAdmin(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  if ((req.session as Record<string, unknown>)?.admin) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
