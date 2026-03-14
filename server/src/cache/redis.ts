import { createClient, type RedisClientType } from "redis";
import type { CargoEntry } from "@/shared/types.js";

const CACHE_PREFIX = "crw:match:";
const SETTINGS_KEY = "crw:settings:cache";
const DEFAULT_TTL_SECONDS = 3600;

export type CacheSettings = {
  ttlSeconds: number;
  enabled: boolean;
};

let client: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!client) {
    client = createClient({ url });
    client.on("error", (err) => console.error("Redis error:", err));
    await client.connect();
  }
  return client;
}

function cacheKey(url: string): string {
  try {
    const u = new URL(url);
    return `${CACHE_PREFIX}${u.origin}${u.pathname}${u.search}`;
  } catch {
    return `${CACHE_PREFIX}${url}`;
  }
}

export async function getCachedMatches(
  url: string,
): Promise<CargoEntry[] | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  const key = cacheKey(url);
  const value = await redis.get(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as CargoEntry[];
  } catch {
    return null;
  }
}

export async function setCachedMatches(
  url: string,
  matches: CargoEntry[],
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  const key = cacheKey(url);
  await redis.setEx(key, ttlSeconds, JSON.stringify(matches));
}

export async function clearCache(): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  const keys = await redis.keys(`${CACHE_PREFIX}*`);
  if (keys.length > 0) {
    await redis.del(keys);
  }
}

export async function getCacheStats(): Promise<{
  entries: number;
  keys: string[];
}> {
  const redis = await getRedisClient();
  if (!redis) return { entries: 0, keys: [] };

  const keys = await redis.keys(`${CACHE_PREFIX}*`);
  return { entries: keys.length, keys: keys.slice(0, 100) };
}

export async function getCacheSettings(): Promise<CacheSettings> {
  const defaultTtl = parseInt(process.env.CACHE_TTL_SECONDS || "3600", 10);
  const defaults: CacheSettings = { ttlSeconds: defaultTtl, enabled: true };

  const redis = await getRedisClient();
  if (!redis) return defaults;

  const value = await redis.get(SETTINGS_KEY);
  if (!value) return defaults;

  try {
    const parsed = JSON.parse(value) as Partial<CacheSettings>;
    return {
      ttlSeconds:
        typeof parsed.ttlSeconds === "number" && parsed.ttlSeconds > 0
          ? parsed.ttlSeconds
          : defaults.ttlSeconds,
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true,
    };
  } catch {
    return defaults;
  }
}

export async function setCacheSettings(settings: Partial<CacheSettings>): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  const current = await getCacheSettings();
  const next: CacheSettings = {
    ttlSeconds: settings.ttlSeconds ?? current.ttlSeconds,
    enabled: settings.enabled ?? current.enabled,
  };
  if (next.ttlSeconds < 60) next.ttlSeconds = 60;
  if (next.ttlSeconds > 60 * 60 * 24 * 365) next.ttlSeconds = 60 * 60 * 24 * 365;
  await redis.set(SETTINGS_KEY, JSON.stringify(next));
}
