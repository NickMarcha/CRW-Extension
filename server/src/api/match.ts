import { Router } from "express";
import { matchByPageContext } from "@/lib/matching/matching.js";
import { loadDataset } from "../dataset.js";
import { fetchPageContext } from "../scraper/puppeteer.js";
import {
  getCachedMatches,
  setCachedMatches,
  getCacheSettings,
} from "../cache/redis.js";

const router = Router();
const DATASET_URL =
  process.env.DATASET_URL ||
  "https://raw.githubusercontent.com/FULU-Foundation/CRW-Extension/refs/heads/export_cargo/all_cargo_combined.json";

router.get("/", async (req, res) => {
  const url = req.query.url as string;
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing or invalid url parameter" });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  try {
    const { enabled } = await getCacheSettings();
    const cached = enabled ? await getCachedMatches(url) : null;
    if (cached) {
      console.log(`[match] cache HIT  ${url} (${cached.length} matches)`);
      res.json({ matches: cached });
      return;
    }

    console.log(`[match] cache MISS ${url} - fetching...`);
    const { all: dataset } = await loadDataset(DATASET_URL);
    const context = await fetchPageContext(url);
    const matches = matchByPageContext(dataset, context);
    const settings = await getCacheSettings();
    if (settings.enabled) {
      await setCachedMatches(url, matches, settings.ttlSeconds);
    }
    console.log(`[match] cached ${url} (${matches.length} matches)`);
    res.json({ matches });
  } catch (error) {
    console.error("[match] error:", error);
    res.status(500).json({
      error: "Failed to fetch and match page",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
