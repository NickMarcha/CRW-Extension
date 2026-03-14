import { randomBytes } from "node:crypto";
import { getRedisClient } from "../cache/redis.js";

const TOKEN_PREFIX = "crw:token:";

// In-memory fallback when Redis is not configured (e.g. local dev)
const memoryTokens = new Map<string, number>();

export async function createToken(): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const redis = await getRedisClient();
  if (redis) {
    await redis.set(
      `${TOKEN_PREFIX}${token}`,
      String(Date.now()),
      { NX: true },
    );
  } else {
    memoryTokens.set(token, Date.now());
  }
  return token;
}

export async function validateToken(token: string): Promise<boolean> {
  const redis = await getRedisClient();
  if (redis) {
    const value = await redis.get(`${TOKEN_PREFIX}${token}`);
    return value !== null;
  }
  return memoryTokens.has(token);
}

export async function revokeToken(token: string): Promise<boolean> {
  const redis = await getRedisClient();
  if (redis) {
    const deleted = await redis.del(`${TOKEN_PREFIX}${token}`);
    return deleted > 0;
  }
  return memoryTokens.delete(token);
}

export async function listTokens(): Promise<
  Array<{ id: string; prefix: string; createdAt: number }>
> {
  const redis = await getRedisClient();
  if (redis) {
    const keys = await redis.keys(`${TOKEN_PREFIX}*`);
    const tokens: Array<{ id: string; prefix: string; createdAt: number }> = [];
    for (const key of keys) {
      const token = key.slice(TOKEN_PREFIX.length);
      const value = await redis.get(key);
      const createdAt = value ? parseInt(value, 10) || 0 : 0;
      tokens.push({
        id: token,
        prefix: `${token.slice(0, 8)}...`,
        createdAt,
      });
    }
    return tokens;
  }
  return Array.from(memoryTokens.entries()).map(([token, createdAt]) => ({
    id: token,
    prefix: `${token.slice(0, 8)}...`,
    createdAt,
  }));
}
