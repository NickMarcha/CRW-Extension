// /src/background/index.ts
import browser from "webextension-polyfill";
import * as Constants from "@/shared/constants";
import * as Matching from "@/lib/matching/matching";
import * as Dataset from "@/lib/dataset";
import * as Messaging from "@/messaging";
import { MessageType } from "@/messaging/type";
import { CargoEntry } from "@/shared/types";

let datasetCache: CargoEntry[] = [];
let datasetLoadPromise: Promise<CargoEntry[]> | null = null;
let nextDatasetRefreshCheckAt = 0;

const getBadgeText = (count: number): string => {
  if (count <= 0) return "";
  if (count > 3) return "3+";
  return String(count);
};

const getServerConfig = async (): Promise<{
  serverUrl: string;
  authToken: string;
}> => {
  const stored = await browser.storage.sync.get([
    Constants.STORAGE.SERVER_URL,
    Constants.STORAGE.AUTH_TOKEN,
  ]);
  return {
    serverUrl: ((stored[Constants.STORAGE.SERVER_URL] as string) || "").trim(),
    authToken: ((stored[Constants.STORAGE.AUTH_TOKEN] as string) || "").trim(),
  };
};

const fetchMatchesFromServer = async (
  url: string,
  serverUrl: string,
  authToken: string,
): Promise<CargoEntry[] | null> => {
  try {
    const base = serverUrl.replace(/\/$/, "");
    const r = await fetch(
      `${base}/api/match?url=${encodeURIComponent(url)}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );
    if (!r.ok) return null;
    const data = (await r.json()) as { matches?: CargoEntry[] };
    return data.matches ?? null;
  } catch {
    return null;
  }
};

const loadDatasetForFallback = async (): Promise<CargoEntry[]> => {
  const now = Date.now();
  if (
    datasetCache.length > 0 &&
    now < nextDatasetRefreshCheckAt
  ) {
    return datasetCache;
  }
  if (datasetLoadPromise) return datasetLoadPromise;
  datasetLoadPromise = (async () => {
    const loaded = await Dataset.load();
    datasetCache = loaded.all;
    const refreshIntervalMs = await Dataset.readConfiguredRefreshIntervalMs();
    nextDatasetRefreshCheckAt = Date.now() + refreshIntervalMs;
    return datasetCache;
  })();
  try {
    return await datasetLoadPromise;
  } catch (error) {
    console.log(`${Constants.LOG_PREFIX} Dataset load failed`, error);
    datasetCache = [];
    nextDatasetRefreshCheckAt = 0;
    return datasetCache;
  } finally {
    datasetLoadPromise = null;
  }
};

const updateTabMatches = async (tabId: number, url: string): Promise<void> => {
  const storageKey = Constants.STORAGE.MATCHES(tabId);
  let matches: CargoEntry[] = [];

  const { serverUrl, authToken } = await getServerConfig();
  if (serverUrl && authToken) {
    const serverMatches = await fetchMatchesFromServer(
      url,
      serverUrl,
      authToken,
    );
    if (serverMatches !== null) {
      matches = serverMatches;
    }
  }

  if (matches.length === 0) {
    const dataset = await loadDatasetForFallback();
    matches = Matching.matchByUrl(dataset, url);
  }

  await browser.storage.local.set({ [storageKey]: matches });
  browser.action.setBadgeText({
    tabId,
    text: getBadgeText(matches.length),
  });
  browser.action.setBadgeBackgroundColor({ tabId, color: "#FF5722" });
};

const readDatasetRefreshInfo = async (): Promise<{
  fetchedAt: number | null;
  lastCheckedAt: number | null;
}> => {
  const stored = await browser.storage.local.get(
    Constants.STORAGE.DATASET_CACHE,
  );
  const cache = stored[Constants.STORAGE.DATASET_CACHE] as
    | { fetchedAt?: unknown; lastCheckedAt?: unknown }
    | undefined;

  return {
    fetchedAt: typeof cache?.fetchedAt === "number" ? cache.fetchedAt : null,
    lastCheckedAt:
      typeof cache?.lastCheckedAt === "number" ? cache.lastCheckedAt : null,
  };
};

const loadDatasetCache = async (options?: {
  forceRefresh?: boolean;
}): Promise<CargoEntry[]> => {
  return loadDatasetForFallback();
};

browser.runtime.onInstalled.addListener(async () => {
  console.log(
    `${Constants.LOG_PREFIX} Extension installed/updated. Loading dataset...`,
  );
  await loadDatasetForFallback();
});

browser.runtime.onStartup.addListener(async () => {
  await loadDatasetForFallback();
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    if (changes[Constants.STORAGE.DATA_REFRESH_INTERVAL_MS]) {
      nextDatasetRefreshCheckAt = 0;
    }
  } else if (areaName === "sync" && changes[Constants.STORAGE.DISPLAY_MODE]) {
    void applyDisplayMode();
  }
});

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await browser.tabs.get(tabId);
  const url = tab?.url;
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    void updateTabMatches(tabId, url);
  } else {
    const storageKey = Constants.STORAGE.MATCHES(tabId);
    const stored = await browser.storage.local.get(storageKey);
    const results = (stored[storageKey] as CargoEntry[]) || [];
    browser.action.setBadgeText({
      tabId,
      text: getBadgeText(results.length),
    });
    browser.action.setBadgeBackgroundColor({ tabId, color: "#FF5722" });
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && (changeInfo.url.startsWith("http://") || changeInfo.url.startsWith("https://"))) {
    void updateTabMatches(tabId, changeInfo.url);
  }
});

const applyDisplayMode = async (): Promise<void> => {
  const stored = await browser.storage.sync.get(
    Constants.STORAGE.DISPLAY_MODE,
  );
  const displayMode = stored[Constants.STORAGE.DISPLAY_MODE] as string;
  const hasSidebar =
    typeof (browser as { sidebarAction?: unknown }).sidebarAction === "object";

  if (displayMode === "sidebar" && hasSidebar) {
    await browser.action.setPopup({ popup: "" });
  } else {
    await browser.action.setPopup({ popup: "popup.html" });
  }
};

browser.action.onClicked.addListener(async () => {
  const stored = await browser.storage.sync.get(
    Constants.STORAGE.DISPLAY_MODE,
  );
  const displayMode = stored[Constants.STORAGE.DISPLAY_MODE] as string;
  const hasSidebar =
    typeof (browser as { sidebarAction?: { open?: () => Promise<void> } })
      .sidebarAction === "object";

  if (displayMode === "sidebar" && hasSidebar) {
    await (browser as { sidebarAction: { open: () => Promise<void> } })
      .sidebarAction.open();
  } else {
    try {
      await (browser.action as { openPopup?: () => Promise<void> }).openPopup?.();
    } catch {
      await browser.windows.create({
        url: browser.runtime.getURL("popup.html"),
        type: "popup",
        width: 400,
        height: 500,
      });
    }
  }
});

void applyDisplayMode();

Messaging.createBackgroundMessageHandler({
  onOpenOptionsPage() {
    return browser.runtime.openOptionsPage();
  },
  async onRefreshDatasetNow() {
    nextDatasetRefreshCheckAt = 0;
    await loadDatasetCache({ forceRefresh: true });
    return await readDatasetRefreshInfo();
  },
});

void loadDatasetForFallback();
