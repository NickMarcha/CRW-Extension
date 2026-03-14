import React, { useEffect, useState } from "react";
import browser from "webextension-polyfill";

import * as Constants from "@/shared/constants";
import {
  OptionsView,
  type DisplayMode,
} from "@/options/OptionsView";
import * as Messaging from "@/messaging";
import { MessageType } from "@/messaging/type";

const readFromSync = async <T,>(
  key: string,
  defaultValue: T,
): Promise<T> => {
  try {
    const stored = await browser.storage.sync.get(key);
    const value = stored[key];
    return (value !== undefined && value !== null ? value : defaultValue) as T;
  } catch {
    return defaultValue;
  }
};

const writeToSync = async (key: string, value: unknown): Promise<void> => {
  await browser.storage.sync.set({ [key]: value });
};

const readWarningsEnabled = async (): Promise<boolean> => {
  const stored = await browser.storage.local.get(
    Constants.STORAGE.WARNINGS_ENABLED,
  );
  const value = stored[Constants.STORAGE.WARNINGS_ENABLED];
  if (typeof value === "boolean") return value;
  return true;
};

const normalizeHostname = (hostname: string): string => {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
};

const readSuppressedDomains = async (): Promise<string[]> => {
  const stored = await browser.storage.local.get(
    Constants.STORAGE.SUPPRESSED_DOMAINS,
  );
  const value = stored[Constants.STORAGE.SUPPRESSED_DOMAINS];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => normalizeHostname(entry))
    .filter((entry) => entry.length > 0);
};

const normalizePageName = (pageName: string): string => {
  return pageName.trim().toLowerCase();
};

const readSuppressedPageNames = async (): Promise<string[]> => {
  const stored = await browser.storage.local.get(
    Constants.STORAGE.SUPPRESSED_PAGE_NAMES,
  );
  const value = stored[Constants.STORAGE.SUPPRESSED_PAGE_NAMES];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const writeSuppressedDomains = async (domains: string[]): Promise<void> => {
  await browser.storage.local.set({
    [Constants.STORAGE.SUPPRESSED_DOMAINS]: domains,
  });
};

const writeSuppressedPageNames = async (pageNames: string[]): Promise<void> => {
  await browser.storage.local.set({
    [Constants.STORAGE.SUPPRESSED_PAGE_NAMES]: pageNames,
  });
};

const readRefreshIntervalMs = async (): Promise<number> => {
  const stored = await browser.storage.local.get(
    Constants.STORAGE.DATA_REFRESH_INTERVAL_MS,
  );
  const value = stored[Constants.STORAGE.DATA_REFRESH_INTERVAL_MS];

  if (
    typeof value === "number" &&
    Constants.DATA_REFRESH_INTERVAL_OPTIONS_MS.includes(
      value as (typeof Constants.DATA_REFRESH_INTERVAL_OPTIONS_MS)[number],
    )
  ) {
    return value;
  }

  return Constants.DEFAULT_DATA_REFRESH_INTERVAL_MS;
};

const readLastRefreshedAt = async (): Promise<number | null> => {
  const stored = await browser.storage.local.get(
    Constants.STORAGE.DATASET_CACHE,
  );
  const cache = stored[Constants.STORAGE.DATASET_CACHE] as
    | { fetchedAt?: unknown }
    | undefined;
  return typeof cache?.fetchedAt === "number" ? cache.fetchedAt : null;
};

const readLastRefreshError = async (): Promise<string | null> => {
  const stored = await browser.storage.local.get(
    Constants.STORAGE.DATA_REFRESH_ERROR,
  );
  const value = stored[Constants.STORAGE.DATA_REFRESH_ERROR] as
    | { message?: unknown }
    | undefined;
  return typeof value?.message === "string" ? value.message : null;
};

const Options = () => {
  const [warningsEnabled, setWarningsEnabled] = useState<boolean>(true);
  const [suppressedDomains, setSuppressedDomains] = useState<string[]>([]);
  const [suppressedPageNames, setSuppressedPageNames] = useState<string[]>([]);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(
    Constants.DEFAULT_DATA_REFRESH_INTERVAL_MS,
  );
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [lastRefreshError, setLastRefreshError] = useState<string | null>(null);
  const [refreshingNow, setRefreshingNow] = useState<boolean>(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [serverUrl, setServerUrl] = useState<string>("");
  const [authToken, setAuthToken] = useState<string>("");
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("popup");
  const [hasSidebarApi, setHasSidebarApi] = useState<boolean>(false);

  useEffect(() => {
    void (async () => {
      try {
        const [
          enabled,
          domains,
          pageNames,
          intervalMs,
          refreshedAt,
          fetchError,
          url,
          token,
          mode,
        ] = await Promise.all([
          readWarningsEnabled(),
          readSuppressedDomains(),
          readSuppressedPageNames(),
          readRefreshIntervalMs(),
          readLastRefreshedAt(),
          readLastRefreshError(),
          readFromSync(Constants.STORAGE.SERVER_URL, ""),
          readFromSync(Constants.STORAGE.AUTH_TOKEN, ""),
          readFromSync<DisplayMode>(Constants.STORAGE.DISPLAY_MODE, "popup"),
        ]);
        setWarningsEnabled(enabled);
        setSuppressedDomains(domains);
        setSuppressedPageNames(pageNames);
        setRefreshIntervalMs(intervalMs);
        setLastRefreshedAt(refreshedAt);
        setLastRefreshError(fetchError);
        setServerUrl(typeof url === "string" ? url : "");
        setAuthToken(typeof token === "string" ? token : "");
        setDisplayMode(
          mode === "sidebar" || mode === "popup" ? mode : "popup",
        );
        setHasSidebarApi(
          typeof (browser as { sidebarAction?: unknown }).sidebarAction ===
            "object",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onStorageChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local") return;

      if (changes[Constants.STORAGE.DATA_REFRESH_INTERVAL_MS]) {
        const nextValue =
          changes[Constants.STORAGE.DATA_REFRESH_INTERVAL_MS].newValue;
        if (
          typeof nextValue === "number" &&
          Constants.DATA_REFRESH_INTERVAL_OPTIONS_MS.includes(
            nextValue as (typeof Constants.DATA_REFRESH_INTERVAL_OPTIONS_MS)[number],
          )
        ) {
          setRefreshIntervalMs(nextValue);
        } else {
          setRefreshIntervalMs(Constants.DEFAULT_DATA_REFRESH_INTERVAL_MS);
        }
      }

      if (changes[Constants.STORAGE.DATASET_CACHE]) {
        const nextCache = changes[Constants.STORAGE.DATASET_CACHE].newValue as
          | { fetchedAt?: unknown }
          | undefined;
        setLastRefreshedAt(
          typeof nextCache?.fetchedAt === "number" ? nextCache.fetchedAt : null,
        );
      }

      if (changes[Constants.STORAGE.DATA_REFRESH_ERROR]) {
        const nextError = changes[Constants.STORAGE.DATA_REFRESH_ERROR]
          .newValue as { message?: unknown } | undefined;
        setLastRefreshError(
          typeof nextError?.message === "string" ? nextError.message : null,
        );
      }
    };

    browser.storage.onChanged.addListener(onStorageChanged);
    return () => {
      browser.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  const onToggleWarnings = async (enabled: boolean) => {
    setWarningsEnabled(enabled);
    await browser.storage.local.set({
      [Constants.STORAGE.WARNINGS_ENABLED]: enabled,
    });
  };

  const onRemoveSuppressedDomain = async (domain: string) => {
    const normalized = normalizeHostname(domain);
    const next = suppressedDomains.filter((value) => value !== normalized);
    setSuppressedDomains(next);
    await writeSuppressedDomains(next);
  };

  const onRemoveSuppressedPageName = async (pageName: string) => {
    const normalized = normalizePageName(pageName);
    const next = suppressedPageNames.filter(
      (value) => normalizePageName(value) !== normalized,
    );
    setSuppressedPageNames(next);
    await writeSuppressedPageNames(next);
  };

  const onChangeRefreshInterval = async (nextRefreshIntervalMs: number) => {
    setRefreshIntervalMs(nextRefreshIntervalMs);
    setRefreshError(null);
    await browser.storage.local.set({
      [Constants.STORAGE.DATA_REFRESH_INTERVAL_MS]: nextRefreshIntervalMs,
    });
  };

  const onSaveServerConfig = async () => {
    await writeToSync(Constants.STORAGE.SERVER_URL, serverUrl.trim());
    await writeToSync(Constants.STORAGE.AUTH_TOKEN, authToken.trim());
    if (serverUrl) {
      try {
        const origin = new URL(serverUrl).origin;
        await browser.permissions.request({
          origins: [`${origin}/*`],
        });
      } catch {
        // Permission request failed or not supported
      }
    }
  };

  const onTestConnection = async () => {
    if (!serverUrl.trim()) {
      setConnectionStatus("error");
      setConnectionError("Enter server URL first");
      return;
    }
    if (!authToken.trim()) {
      setConnectionStatus("error");
      setConnectionError("Enter auth token first");
      return;
    }
    setConnectionStatus("testing");
    setConnectionError(null);
    try {
      const base = serverUrl.replace(/\/$/, "");
      const r = await fetch(
        `${base}/api/match?url=${encodeURIComponent("https://example.com")}`,
        {
          headers: { Authorization: `Bearer ${authToken.trim()}` },
        },
      );
      if (r.ok) {
        setConnectionStatus("ok");
      } else {
        const data = await r.json().catch(() => ({})) as { error?: string };
        setConnectionStatus("error");
        setConnectionError(data.error || `HTTP ${r.status}`);
      }
    } catch (err) {
      setConnectionStatus("error");
      setConnectionError(
        err instanceof Error ? err.message : "Connection failed",
      );
    }
  };

  const onDisplayModeChange = async (mode: DisplayMode) => {
    setDisplayMode(mode);
    await writeToSync(Constants.STORAGE.DISPLAY_MODE, mode);
  };

  const onOpenServerDashboard = () => {
    const base = serverUrl.trim().replace(/\/$/, "");
    if (base) {
      browser.tabs.create({ url: `${base}/admin/` });
    }
  };

  const onCheckForUpdates = () => {
    browser.tabs.create({ url: Constants.UPDATES_URL });
  };

  const onRefreshNow = async () => {
    setRefreshingNow(true);
    setRefreshError(null);

    try {
      const response = (await browser.runtime.sendMessage(
        Messaging.createMessage(MessageType.REFRESH_DATASET_NOW, "options"),
      )) as { fetchedAt?: number | null } | undefined;

      if (typeof response?.fetchedAt === "number") {
        setLastRefreshedAt(response.fetchedAt);
      } else {
        setLastRefreshedAt(await readLastRefreshedAt());
      }
    } catch (error) {
      console.error(
        `${Constants.LOG_PREFIX} Manual dataset refresh failed`,
        error,
      );
      setRefreshError("Refresh failed. Please try again.");
    } finally {
      setRefreshingNow(false);
    }
  };

  return (
    <OptionsView
      warningsEnabled={warningsEnabled}
      suppressedDomains={suppressedDomains}
      suppressedPageNames={suppressedPageNames}
      refreshIntervalMs={refreshIntervalMs}
      lastRefreshedAt={lastRefreshedAt}
      refreshingNow={refreshingNow}
      refreshError={refreshError}
      lastRefreshError={lastRefreshError}
      loading={loading}
      serverUrl={serverUrl}
      authToken={authToken}
      connectionStatus={connectionStatus}
      connectionError={connectionError}
      displayMode={displayMode}
      hasSidebarApi={hasSidebarApi}
      onToggleWarnings={(enabled) => {
        void onToggleWarnings(enabled);
      }}
      onChangeRefreshInterval={(nextRefreshIntervalMs) => {
        void onChangeRefreshInterval(nextRefreshIntervalMs);
      }}
      onRefreshNow={() => {
        void onRefreshNow();
      }}
      onRemoveSuppressedDomain={(domain) => {
        void onRemoveSuppressedDomain(domain);
      }}
      onRemoveSuppressedPageName={(pageName) => {
        void onRemoveSuppressedPageName(pageName);
      }}
      onServerUrlChange={setServerUrl}
      onAuthTokenChange={setAuthToken}
      onSaveServerConfig={() => void onSaveServerConfig()}
      onTestConnection={() => void onTestConnection()}
      onDisplayModeChange={(mode) => void onDisplayModeChange(mode)}
      onOpenServerDashboard={() => void onOpenServerDashboard()}
      onCheckForUpdates={() => void onCheckForUpdates()}
    />
  );
};

export default Options;
