import {
  Action,
  ActionPanel,
  Icon,
  List,
  closeMainWindow,
  showHUD,
} from "@raycast/api";
import { getFavicon, usePromise } from "@raycast/utils";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

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
  cookieStoreId: string;
  container: { name: string; color: string; icon: string } | null;
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

// -- URL keyword extraction --

/**
 * Extract searchable keywords from a URL.
 * Returns hostname, hostname parts, and pathname segments.
 * This enables Raycast's built-in fuzzy filter to match URLs
 * typed in the search bar (List.Item subtitle is NOT searched by default).
 */
function urlKeywords(url: string): string[] {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const hostParts = hostname.split(".").filter(Boolean);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return [hostname, ...hostParts, ...pathParts];
  } catch {
    return [url];
  }
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
    const res = await fetch(`http://127.0.0.1:${port}/tabs?offset=${allTabs.length}`);
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

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search Firefox tabs...">
      {tabs.map((tab) => (
        <List.Item
          key={String(tab.id)}
          icon={getFavicon(tab.url)}
          title={tab.title || "Untitled"}
          subtitle={tab.url}
          keywords={urlKeywords(tab.url)}
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
