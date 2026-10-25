import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Image,
  Keyboard,
  LaunchType,
  List,
  Toast,
  closeMainWindow,
  launchCommand,
  showToast,
} from "@raycast/api";
import { MutatePromise, getAvatarIcon, usePromise } from "@raycast/utils";
import { execFile } from "child_process";
import { watch } from "fs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ClassifiedError, FailureMode, classifyError, fetchWithRetry, showActionError } from "./lib/errors";
import { AMO_URL } from "./lib/constants";
import { faviconPath } from "./lib/favicon-cache";
import { CONFIG_DIR, type Host, fetchFromHosts, readHosts } from "./lib/hosts";
import { type ProfileLabel, labelProfile, loadProfiles } from "./lib/profiles";

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

/** A tab together with the native host (and so the Firefox profile) it came from. */
interface HostTab extends Tab {
  host: Host;
}

/** Tab and window IDs are only unique within one Firefox profile. */
function tabKey(tab: HostTab): string {
  return `${tab.host.key}:${tab.id}`;
}

function windowKey(tab: HostTab): string {
  return `${tab.host.key}:${tab.windowId}`;
}

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
  // Use charAt(0) and check for surrogates — emoji first chars are lone
  // high surrogates which crash encodeURIComponent inside getAvatarIcon.
  const raw = tab.title?.[0] ?? "";
  const code = raw.charCodeAt(0);
  const isSurrogate = code >= 0xd800 && code <= 0xdfff;
  const letter = ((isSurrogate ? "" : raw) || hostname?.[0] || "?").toUpperCase();
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
function getTabIcon(tab: Tab, favicons: Record<string, string>): Image.ImageLike {
  // Data URIs come directly from Firefox (most common case); http(s)
  // favicons are fetched via the native host into `favicons`.
  const dataUri = tab.favIconUrl?.startsWith("data:") ? tab.favIconUrl : tab.favIconUrl && favicons[tab.favIconUrl];
  if (dataUri) {
    return {
      source: faviconPath(dataUri) ?? dataUri,
      mask: Image.Mask.RoundedRectangle,
    };
  }
  return getFallbackIcon(tab);
}

// -- Accessory helpers --

const CONTAINER_COLORS: Record<string, Color> = {
  blue: Color.Blue,
  turquoise: Color.Blue,
  green: Color.Green,
  yellow: Color.Yellow,
  orange: Color.Orange,
  red: Color.Red,
  pink: Color.Magenta,
  purple: Color.Purple,
};

/**
 * One colour per Firefox profile, indexed by ProfileLabel.colorIndex (see
 * PROFILE_COLOR_COUNT). Green is left out because the Active tag uses it.
 */
const PROFILE_COLORS: Color[] = [Color.Blue, Color.Orange, Color.Purple, Color.Magenta, Color.Yellow, Color.Red];

function profileIcon(profile: ProfileLabel, color: Color): Image.ImageLike {
  if ("path" in profile.icon) {
    return { source: profile.icon.path, mask: Image.Mask.Circle };
  }
  return { source: Icon[profile.icon.name as keyof typeof Icon] ?? Icon.PersonCircle, tintColor: color };
}

/**
 * Build the accessories array for a List.Item.
 * Order: Pin icon, Active tag, Container tag, Window tag.
 *
 * With more than one profile connected, the window tag shows the profile's
 * avatar and is coloured per profile.
 */
function buildAccessories(tab: Tab, windowNumber: number, profile: ProfileLabel | null): List.Item.Accessory[] {
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
        color: CONTAINER_COLORS[tab.container.color] || Color.SecondaryText,
      },
    });
  }
  if (profile) {
    const color = PROFILE_COLORS[profile.colorIndex % PROFILE_COLORS.length];
    accessories.push({
      tag: { value: "W" + windowNumber, color },
      icon: profileIcon(profile, color),
      tooltip: `${profile.name}, window ${windowNumber}`,
    });
  } else {
    accessories.push({
      tag: { value: "W" + windowNumber, color: Color.SecondaryText },
    });
  }

  return accessories;
}

// -- Tab switching --

async function switchTab(tab: HostTab) {
  await closeMainWindow({ clearRootSearch: true });
  try {
    const response = await fetch(`http://127.0.0.1:${tab.host.port}/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId: tab.id, windowId: tab.windowId }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }
  } catch (error) {
    await showActionError(error, "switch tab");
  }
}

// -- Tab closing --

async function closeTab(tab: HostTab, mutate: MutatePromise<HostTab[], undefined>) {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Closing tab...",
  });
  try {
    await mutate(
      (async () => {
        const res = await fetch(`http://127.0.0.1:${tab.host.port}/close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId: tab.id }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
      })(),
      {
        optimisticUpdate(data) {
          return (data ?? []).filter((t) => tabKey(t) !== tabKey(tab));
        },
      }
    );
    toast.style = Toast.Style.Success;
    toast.title = "Tab closed";
  } catch (error) {
    toast.hide();
    await showActionError(error, "close tab");
  }
}

// -- Fetch all tabs (handles pagination) --

async function fetchAllTabs(host: Host): Promise<HostTab[]> {
  const allTabs: HostTab[] = [];
  let hasMore = true;
  const maxPages = 20;
  let pages = 0;

  while (hasMore && pages < maxPages) {
    const res = await fetch(`http://127.0.0.1:${host.port}/tabs?offset=${allTabs.length}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const json = (await res.json()) as TabsResponse;
    const batch = json.data?.tabs ?? [];
    if (batch.length === 0) break;
    allTabs.push(...batch.map((tab) => ({ ...tab, host })));
    hasMore = json.data?.hasMore ?? false;
    pages++;
  }

  return allTabs;
}

/**
 * Fetch tabs from every running Firefox profile. Hosts are re-read on each
 * call so retries pick up a host that has just started.
 */
async function fetchTabsFromAllHosts(): Promise<HostTab[]> {
  const hosts = readHosts();
  // Distinct error so classifyError skips pgrep (avoids a race during
  // Firefox shutdown where the process lingers briefly).
  if (hosts.length === 0) throw new Error("port-file-missing");
  return fetchFromHosts(hosts, fetchAllTabs);
}

// -- Error empty view --

const ERROR_ICONS: Record<FailureMode, Icon> = {
  [FailureMode.FirefoxNotRunning]: Icon.Globe,
  [FailureMode.ExtensionNotInstalled]: Icon.Plug,
  [FailureMode.HostNotRunning]: Icon.Terminal,
  [FailureMode.Unknown]: Icon.ExclamationMark,
};

// -- Component --

export default function SearchTabs() {
  const [classifiedError, setClassifiedError] = useState<ClassifiedError | null>(null);

  const handleError = useCallback(async (error: Error) => {
    setClassifiedError(await classifyError(error));
  }, []);

  const handleData = useCallback(() => {
    setClassifiedError(null);
  }, []);

  const {
    data: tabs = [],
    isLoading,
    revalidate,
    mutate,
  } = usePromise(
    () => {
      // Fast-fail: if no host is registered, none is listening, so skip retries.
      if (readHosts().length === 0) {
        return Promise.reject(new Error("port-file-missing"));
      }
      return fetchWithRetry(fetchTabsFromAllHosts);
    },
    [],
    {
      onError: handleError,
      onData: handleData,
    }
  );
  // Watch ~/.raycast-firefox for host records. Each native host writes
  // hosts/<firefoxPid>.json (and the shared port file) once it is listening
  // and removes them when its Firefox profile disconnects, so a profile
  // starting or quitting refreshes the list straight away.
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const watcher = watch(CONFIG_DIR, { recursive: true }, (_event, filename) => {
        if (filename === "port" || filename?.startsWith("hosts")) {
          // Coalesce the burst of events from one atomic write.
          clearTimeout(timer);
          timer = setTimeout(revalidate, 500);
        }
      });
      return () => {
        clearTimeout(timer);
        watcher.close();
      };
    } catch {
      // Directory doesn't exist yet — user needs manual setup
    }
  }, [revalidate]);

  const { data: profiles = [] } = usePromise(loadProfiles, []);
  const [profileFilter, setProfileFilter] = useState("all");

  // Label each connected profile. With a single profile there is nothing to
  // tell apart, so tabs keep the plain window tag.
  const profileLabels = useMemo(() => {
    const hosts = new Map(tabs.map((t) => [t.host.key, t.host]));
    const labels = new Map<string, ProfileLabel>();
    if (hosts.size < 2) return labels;
    for (const host of hosts.values()) {
      labels.set(
        host.key,
        labelProfile(host.profilePath, profiles) ?? {
          name: `Firefox (process ${host.firefoxPid ?? host.port})`,
          icon: { name: "PersonCircle" },
          colorIndex: labels.size,
        }
      );
    }
    return labels;
  }, [tabs, profiles]);

  const [favicons, setFavicons] = useState<Record<string, string>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  // Fetch favicons for all tabs that have a favIconUrl
  useEffect(() => {
    if (!tabs || tabs.length === 0) return;

    // Collect unique http(s) favIconUrls that we haven't fetched yet.
    // Data URIs are used directly by getTabIcon — no proxy needed.
    const urlsToFetch = [
      ...new Set(
        tabs
          .filter(
            (t) =>
              t.favIconUrl &&
              !t.favIconUrl.startsWith("data:") &&
              !favicons[t.favIconUrl] &&
              !fetchedRef.current.has(t.favIconUrl)
          )
          .map((t) => t.favIconUrl as string)
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
        const res = await fetch(`http://127.0.0.1:${tabs[0].host.port}/favicon?url=${encodeURIComponent(url)}`);
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
  // A filtered profile that has since quit falls back to showing every profile.
  const activeFilter = profileLabels.has(profileFilter) ? profileFilter : "all";
  const visibleTabs = activeFilter === "all" ? tabs : tabs.filter((t) => t.host.key === activeFilter);
  const sortedTabs = [...visibleTabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));

  // Number windows across all profiles, grouped by profile, so each W<n> is
  // unique and a profile's windows sit together.
  const windowNumbers = useMemo(() => {
    const profileOrder = (t: HostTab) => profileLabels.get(t.host.key)?.colorIndex ?? 0;
    const windows = [...new Map(tabs.map((t) => [windowKey(t), t])).values()].sort(
      (a, b) => profileOrder(a) - profileOrder(b) || a.host.key.localeCompare(b.host.key) || a.windowId - b.windowId
    );
    return new Map(windows.map((t, i) => [windowKey(t), i + 1]));
  }, [tabs, profileLabels]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search Firefox tabs..."
      searchBarAccessory={
        profileLabels.size > 1 ? (
          <List.Dropdown tooltip="Firefox Profile" value={activeFilter} onChange={setProfileFilter}>
            <List.Dropdown.Item title="All Profiles" value="all" icon={Icon.Globe} />
            {[...profileLabels].map(([key, label]) => (
              <List.Dropdown.Item
                key={key}
                title={label.name}
                value={key}
                icon={profileIcon(label, PROFILE_COLORS[label.colorIndex % PROFILE_COLORS.length])}
              />
            ))}
          </List.Dropdown>
        ) : undefined
      }
    >
      <List.EmptyView
        icon={classifiedError ? ERROR_ICONS[classifiedError.mode] : Icon.MagnifyingGlass}
        title={classifiedError ? classifiedError.title : "No Results"}
        description={classifiedError?.description}
        actions={
          classifiedError ? (
            <ActionPanel>
              {classifiedError.mode === FailureMode.FirefoxNotRunning && (
                <Action
                  title="Launch Firefox"
                  icon={Icon.Globe}
                  onAction={() => {
                    execFile("open", ["-a", "Firefox"]);
                    setTimeout(revalidate, 2000);
                  }}
                />
              )}
              {classifiedError.mode === FailureMode.ExtensionNotInstalled && (
                <Action.OpenInBrowser title="Install Firefox Extension" url={AMO_URL} />
              )}
              {classifiedError.mode === FailureMode.HostNotRunning && (
                <Action
                  title="Set up Native Host"
                  icon={Icon.Terminal}
                  onAction={async () => {
                    await launchCommand({
                      name: "setup-bridge",
                      type: LaunchType.UserInitiated,
                    });
                  }}
                />
              )}
              <Action
                title="Retry"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={revalidate}
              />
            </ActionPanel>
          ) : undefined
        }
      />
      {sortedTabs.map((tab) => {
        const profile = profileLabels.get(tab.host.key) ?? null;
        return (
          <List.Item
            key={tabKey(tab)}
            icon={getTabIcon(tab, favicons)}
            title={tab.title || "Untitled"}
            subtitle={cleanUrl(tab.url)}
            keywords={profile ? [...urlKeywords(tab.url), ...profile.name.split(/\s+/)] : urlKeywords(tab.url)}
            accessories={buildAccessories(tab, windowNumbers.get(windowKey(tab)) ?? 1, profile)}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action title="Switch to Tab" icon={Icon.Globe} onAction={() => switchTab(tab)} />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="Close Tab"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={Keyboard.Shortcut.Common.Remove}
                    onAction={() => closeTab(tab, mutate)}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
