import { Router } from "express";
import {
  createToken,
  listTokens,
  revokeToken,
} from "../auth/tokens.js";
import {
  getCacheStats,
  clearCache,
  getCacheSettings,
  setCacheSettings,
} from "../cache/redis.js";
import { checkAdminCredentials, requireAdmin } from "../auth/session.js";

const router = Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }
  if (!checkAdminCredentials(username, password)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  (req.session as { admin?: boolean }).admin = true;
  res.json({ success: true });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ success: true });
});

router.use((req, res, next) => requireAdmin(req, res, next));

router.get("/tokens", async (_req, res) => {
  const tokens = await listTokens();
  res.json({ tokens });
});

router.post("/tokens", async (_req, res) => {
  const token = await createToken();
  res.json({ token });
});

router.delete("/tokens/:id", async (req, res) => {
  const { id } = req.params;
  const deleted = await revokeToken(id);
  if (!deleted) {
    res.status(404).json({ error: "Token not found" });
    return;
  }
  res.json({ success: true });
});

router.get("/cache/stats", async (_req, res) => {
  try {
    const stats = await getCacheStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: "Failed to get cache stats",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/cache/clear", async (_req, res) => {
  try {
    await clearCache();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: "Failed to clear cache",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/cache/settings", async (_req, res) => {
  try {
    const settings = await getCacheSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({
      error: "Failed to get cache settings",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/cache/settings", async (req, res) => {
  try {
    const { ttlSeconds, enabled } = req.body || {};
    const updates: { ttlSeconds?: number; enabled?: boolean } = {};
    if (ttlSeconds !== undefined) {
      const ttl = parseInt(String(ttlSeconds), 10);
      if (isNaN(ttl) || ttl < 60) {
        res.status(400).json({
          error: "ttlSeconds must be at least 60",
        });
        return;
      }
      updates.ttlSeconds = ttl;
    }
    if (typeof enabled === "boolean") {
      updates.enabled = enabled;
    }
    if (Object.keys(updates).length > 0) {
      await setCacheSettings(updates);
    }
    const settings = await getCacheSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({
      error: "Failed to save cache settings",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
