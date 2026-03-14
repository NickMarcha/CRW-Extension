import type { CargoEntry, CargoEntryType, LoadResult } from "@/shared/types.js";
import { decodeEntityStrings } from "@/shared/html.js";
import { DATASET_KEYS } from "@/shared/constants.js";

const DEFAULT_DATASET_URL =
  "https://raw.githubusercontent.com/FULU-Foundation/CRW-Extension/refs/heads/export_cargo/all_cargo_combined.json";

let datasetCache: CargoEntry[] = [];
let datasetFetchedAt = 0;
const DATASET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const validateDataset = (json: unknown): void => {
  if (!json || typeof json !== "object") return;
  const obj = json as Record<string, unknown>;
  for (const key of DATASET_KEYS as CargoEntryType[]) {
    if (!Array.isArray(obj[key])) {
      obj[key] = [];
    }
  }
};

const flattenDataset = (json: Record<string, unknown>): CargoEntry[] => {
  const flattened: CargoEntry[] = [];

  for (const key of DATASET_KEYS as CargoEntryType[]) {
    const section = (json[key] || []) as Record<string, unknown>[];

    for (const item of section) {
      const decodedItem = decodeEntityStrings(item) as Record<string, unknown>;
      flattened.push({
        ...decodedItem,
        _type: key,
      } as CargoEntry);
    }
  }

  return flattened;
};

export async function loadDataset(
  datasetUrl = DEFAULT_DATASET_URL,
  forceRefresh = false,
): Promise<LoadResult> {
  const now = Date.now();
  const isFresh =
    datasetCache.length > 0 &&
    !forceRefresh &&
    now - datasetFetchedAt < DATASET_CACHE_TTL_MS;

  if (isFresh) {
    return { raw: {}, all: datasetCache };
  }

  const response = await fetch(datasetUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Dataset fetch failed: ${response.status}`);
  }

  const json = (await response.json()) as Record<string, unknown>;
  validateDataset(json);
  datasetCache = flattenDataset(json);
  datasetFetchedAt = now;

  return { raw: json, all: datasetCache };
}

export function getCachedDataset(): CargoEntry[] {
  return datasetCache;
}
