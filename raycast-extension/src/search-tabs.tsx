import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Image,
  List,
  closeMainWindow,
  showHUD,
} from "@raycast/api";
import { getAvatarIcon, usePromise } from "@raycast/utils";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { useEffect, useRef, useState } from "react";

// -- Types matching the native host HTTP API response --

interface Tab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl: string | null;
  active: boolean;
  pinned: boolean;
  incognito: boolean;
  status: string;
  lastAccessed: number;
  cookieStoreId: string;
  container: {
    name: string;
    color: string;
    colorCode: string;
    icon: string;
  } | null;
}

interface TabsResponse {
  ok: boolean;
  data: {
    tabs: Tab[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
  meta: { count: number; timestamp: number };
}

// -- Port discovery --

/**
 * Read the HTTP server port from ~/.raycast-firefox/port.
 * Falls back to 26394 on any error (file missing, parse failure).
 */
function getPort(): number {
  try {
    const portPath = join(homedir(), ".raycast-firefox", "port");
    const content = readFileSync(portPath, "utf-8").trim();
    const port = parseInt(content, 10);
    if (Number.isNaN(port) || port <= 0 || port > 65535) {
      return 26394;
    }
    return port;
  } catch {
    return 26394;
  }
}

const port = getPort();

// -- URL helpers --

/**
 * Extract hostname from a URL string. Returns empty string on parse failure.
 */
function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Clean a URL for display: hostname (without www.) + pathname (omit if just "/").
 * Returns raw URL on parse failure.
 */
function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname;
    return hostname + pathname;
  } catch {
    return url;
  }
}

/**
 * Extract searchable keywords from a URL.
 * Includes the full URL string so search matches protocol and query params
 * even though the subtitle now shows the cleaned URL.
 */
function urlKeywords(url: string): string[] {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const hostParts = hostname.split(".").filter(Boolean);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return [url, hostname, ...hostParts, ...pathParts];
  } catch {
    return [url];
  }
}

// -- Fallback icon helpers --

/**
 * 14-color palette for domain-based letter avatars.
 * Same palette as used by @raycast/utils getAvatarIcon.
 */
const AVATAR_COLORS = [
  "#DC829A",
  "#D64854",
  "#D47600",
  "#D36CDD",
  "#52A9E4",
  "#7871E8",
  "#70920F",
  "#43B93A",
  "#EB6B3E",
  "#26B795",
  "#D85A9B",
  "#A067DC",
  "#BD9500",
  "#5385D9",
];

/**
 * DJB2 hash of a hostname to deterministically select a color from the palette.
 */
function domainColor(hostname: string): string {
  let hash = 5381;
  for (let i = 0; i < hostname.length; i++) {
    hash = (hash * 33) ^ hostname.charCodeAt(i);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Return a fallback icon for a tab:
 * - about:* pages -> Firefox icon
 * - Loading tabs -> CircleProgress spinner
 * - Otherwise -> letter avatar colored by domain
 */
function getFallbackIcon(tab: Tab): Image.ImageLike {
  if (tab.url.startsWith("about:")) {
    return { source: "firefox-icon.png" };
  }
  if (tab.status === "loading") {
    return Icon.CircleProgress;
  }
  const hostname = getHostname(tab.url);
  const letter = (tab.title?.[0] || hostname?.[0] || "?").toUpperCase();
  return getAvatarIcon(letter, {
    background: domainColor(hostname),
    gradient: false,
  });
}

/**
 * Return the best available icon for a tab:
 * - If a cached favicon data URI is available, use it
 * - Otherwise fall back to letter avatar / Firefox icon / loading spinner
 */
function getTabIcon(
  tab: Tab,
  favicons: Record<string, string>,
): Image.ImageLike {
  if (tab.favIconUrl && favicons[tab.favIconUrl]) {
    return {
      source: favicons[tab.favIconUrl],
      mask: Image.Mask.RoundedRectangle,
    };
  }
  return getFallbackIcon(tab);
}

// -- Accessory helpers --

/**
 * Get the 1-based window number for a windowId given a sorted list of all window IDs.
 */
function getWindowNumber(windowId: number, allWindowIds: number[]): number {
  const idx = allWindowIds.indexOf(windowId);
  return idx >= 0 ? idx + 1 : 1;
}

/**
 * Build the accessories array for a List.Item.
 * Order: Pin icon, Active tag, Container tag, Window tag.
 */
function buildAccessories(
  tab: Tab,
  windowNumber: number,
): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];

  if (tab.pinned) {
    accessories.push({ icon: Icon.Pin, tooltip: "Pinned" });
  }
  if (tab.active) {
    accessories.push({ tag: { value: "Active", color: Color.Green } });
  }
  if (tab.container) {
    accessories.push({
      tag: {
        value: tab.container.name,
        color: tab.container.colorCode || Color.SecondaryText,
      },
    });
  }
  accessories.push({
    tag: { value: "W" + windowNumber, color: Color.SecondaryText },
  });

  return accessories;
}

// -- Tab switching --

async function switchTab(tabId: number, windowId: number) {
  await closeMainWindow({ clearRootSearch: true });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId, windowId }),
    });
    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => ({ error: "Unknown error" }))) as { error?: string };
      await showHUD(`Switch failed: ${body.error ?? "Unknown error"}`);
    }
  } catch {
    await showHUD("Could not connect to Firefox");
  }
}

// -- Fetch all tabs (handles pagination) --

async function fetchAllTabs(): Promise<Tab[]> {
  const allTabs: Tab[] = [];
  let hasMore = true;
  const maxPages = 20;
  let pages = 0;

  while (hasMore && pages < maxPages) {
    const res = await fetch(
      `http://127.0.0.1:${port}/tabs?offset=${allTabs.length}`,
    );
    if (!res.ok) break;
    const json = (await res.json()) as TabsResponse;
    const batch = json.data?.tabs ?? [];
    if (batch.length === 0) break;
    allTabs.push(...batch);
    hasMore = json.data?.hasMore ?? false;
    pages++;
  }

  return allTabs;
}

// -- Component --

export default function SearchTabs() {
  const { data: tabs = [], isLoading } = usePromise(fetchAllTabs);
  const [favicons, setFavicons] = useState<Record<string, string>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  // Fetch favicons for all tabs that have a favIconUrl
  useEffect(() => {
    if (!tabs || tabs.length === 0) return;

    // Collect unique favIconUrls that we haven't fetched yet
    const urlsToFetch = [
      ...new Set(
        tabs
          .filter(
            (t) =>
              t.favIconUrl &&
              !favicons[t.favIconUrl] &&
              !fetchedRef.current.has(t.favIconUrl),
          )
          .map((t) => t.favIconUrl as string),
      ),
    ];

    if (urlsToFetch.length === 0) return;

    // Mark as in-flight so we don't re-fetch on next render
    for (const url of urlsToFetch) {
      fetchedRef.current.add(url);
    }

    // Fetch all favicons in parallel, batch-update state when all settle
    const results: Record<string, string> = {};
    let settled = 0;

    urlsToFetch.forEach(async (url) => {
      try {
        const res = await fetch(
          `http://127.0.0.1:${port}/favicon?url=${encodeURIComponent(url)}`,
        );
        if (res.ok) {
          const json = (await res.json()) as {
            ok: boolean;
            data?: { dataUri: string };
          };
          if (json.ok && json.data?.dataUri) {
            results[url] = json.data.dataUri;
          }
        }
      } catch {
        // Favicon fetch failed -- fallback icon will be used
      } finally {
        settled++;
        if (settled === urlsToFetch.length) {
          setFavicons((prev) => ({ ...prev, ...results }));
        }
      }
    });
  }, [tabs]);

  // Sort tabs by most recently accessed first
  const sortedTabs = [...tabs].sort(
    (a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0),
  );

  // Compute unique sorted window IDs for window number assignment
  const windowIds = [...new Set(sortedTabs.map((t) => t.windowId))].sort(
    (a, b) => a - b,
  );

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search Firefox tabs...">
      {sortedTabs.map((tab) => (
        <List.Item
          key={String(tab.id)}
          icon={getTabIcon(tab, favicons)}
          title={tab.title || "Untitled"}
          subtitle={cleanUrl(tab.url)}
          keywords={urlKeywords(tab.url)}
          accessories={buildAccessories(
            tab,
            getWindowNumber(tab.windowId, windowIds),
          )}
          actions={
            <ActionPanel>
              <Action
                title="Switch to Tab"
                icon={Icon.Globe}
                onAction={() => switchTab(tab.id, tab.windowId)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
