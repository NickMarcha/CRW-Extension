import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matchRouter from "./api/match.js";
import adminRouter from "./admin/routes.js";
import { sessionMiddleware } from "./auth/session.js";
import { requireToken } from "./auth/middleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());
app.use(sessionMiddleware);

app.get("/health", (_req, res) => {
  let version = "unknown";
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      version?: string;
    };
    version = pkg.version ?? version;
  } catch {
    // ignore
  }
  res.json({
    status: "ok",
    version,
    timestamp: new Date().toISOString(),
  });
});

app.use(
  "/api/match",
  (req, _res, next) => {
    console.log(`[match] request: ${req.query.url as string}`);
    next();
  },
  requireToken,
  matchRouter,
);
app.use("/admin/api", adminRouter);

app.use(
  "/admin",
  express.static(path.join(__dirname, "..", "public", "admin")),
);

app.get("/admin", (_req, res) => {
  res.redirect("/admin/");
});

app.get("/admin/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "admin", "index.html"));
});

app.listen(PORT, async () => {
  console.log(`CRW Server listening on port ${PORT}`);
  const { getRedisClient } = await import("./cache/redis.js");
  const redis = await getRedisClient();
  console.log(`Redis: ${redis ? "connected" : "not configured (REDIS_URL unset)"}`);
});
