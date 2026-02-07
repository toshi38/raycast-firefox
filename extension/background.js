/**
 * Raycast Firefox - Background Script
 *
 * Persistent background script that handles native messaging communication
 * for tab management commands: list-tabs, switch-tab, close-tab.
 *
 * Native port is lazily connected on first request and auto-reconnects
 * after disconnection by nulling the port reference.
 */

"use strict";

const NATIVE_APP_NAME = "raycast_firefox";
const MAX_RECENT_MESSAGES = 50;
const DEFAULT_PAGE_SIZE = 500;

// ---------------------------------------------------------------------------
// Native port management
// ---------------------------------------------------------------------------

let port = null;
const recentMessages = [];

/**
 * Push an entry into the circular message buffer.
 * @param {"in"|"out"} direction
 * @param {object} message
 */
const recordMessage = (direction, message) => {
  recentMessages.push({
    timestamp: Date.now(),
    direction,
    message,
  });
  if (recentMessages.length > MAX_RECENT_MESSAGES) {
    recentMessages.shift();
  }
};

/**
 * Return (and lazily create) the native messaging port.
 * If the previous port was disconnected the reference will have been set to
 * null, so a fresh connection is established transparently.
 */
const getPort = () => {
  if (port) {
    return port;
  }

  console.log("[Raycast Firefox] Connecting to native host:", NATIVE_APP_NAME);
  port = browser.runtime.connectNative(NATIVE_APP_NAME);

  port.onMessage.addListener((msg) => {
    console.log("[Raycast Firefox] Received from native host:", msg);
    recordMessage("in", msg);
    handleMessage(msg);
  });

  port.onDisconnect.addListener((p) => {
    const err = p.error || browser.runtime.lastError;
    console.warn(
      "[Raycast Firefox] Native port disconnected:",
      err ? err.message : "(no error)"
    );
    port = null;
  });

  return port;
};

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Send a success response back through the native port.
 */
const sendSuccess = (id, data) => {
  const response = { id, ok: true, data };
  console.log("[Raycast Firefox] Sending response:", response);
  recordMessage("out", response);
  getPort().postMessage(response);
};

/**
 * Send an error response back through the native port.
 */
const sendError = (id, error) => {
  const response = { id, ok: false, error: String(error) };
  console.log("[Raycast Firefox] Sending error:", response);
  recordMessage("out", response);
  getPort().postMessage(response);
};

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

/**
 * list-tabs: Return all open tabs with optional pagination.
 * Includes container (contextual identity) metadata when available.
 */
const handleListTabs = async (params = {}) => {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const pageSize = Math.max(1, parseInt(params.pageSize, 10) || DEFAULT_PAGE_SIZE);

  // Fetch all tabs across all windows
  const tabs = await browser.tabs.query({});

  // Attempt to resolve container metadata (may fail if containers are disabled)
  let containerMap = {};
  try {
    const identities = await browser.contextualIdentities.query({});
    for (const ci of identities) {
      containerMap[ci.cookieStoreId] = {
        name: ci.name,
        color: ci.color,
        icon: ci.icon,
      };
    }
  } catch (err) {
    // Containers not enabled or permission missing -- degrade gracefully
    console.warn("[Raycast Firefox] Could not load contextual identities:", err.message);
  }

  // Map to response shape
  const mapped = tabs.map((tab) => ({
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl || null,
    active: tab.active,
    pinned: tab.pinned,
    incognito: tab.incognito,
    status: tab.status,
    cookieStoreId: tab.cookieStoreId,
    container: containerMap[tab.cookieStoreId] || null,
  }));

  // Paginate
  const total = mapped.length;
  const start = (page - 1) * pageSize;
  const paginated = mapped.slice(start, start + pageSize);

  return {
    tabs: paginated,
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total,
  };
};

/**
 * switch-tab: Activate a tab and focus its window.
 */
const handleSwitchTab = async (params = {}) => {
  const { tabId } = params;
  if (tabId == null) {
    throw new Error("tabId is required");
  }
  const tab = await browser.tabs.update(tabId, { active: true });
  await browser.windows.update(tab.windowId, { focused: true });
  return { tabId: tab.id, windowId: tab.windowId };
};

/**
 * close-tab: Remove a tab.
 */
const handleCloseTab = async (params = {}) => {
  const { tabId } = params;
  if (tabId == null) {
    throw new Error("tabId is required");
  }
  await browser.tabs.remove(tabId);
  return { tabId };
};

// ---------------------------------------------------------------------------
// Message routing
// ---------------------------------------------------------------------------

/**
 * Route an incoming native message to the appropriate command handler.
 * Every response echoes the message `id` for request-response correlation.
 */
const handleMessage = async (message) => {
  const { id, command, params } = message;

  if (!id) {
    console.warn("[Raycast Firefox] Message missing id field, ignoring:", message);
    return;
  }

  try {
    let data;
    switch (command) {
      case "list-tabs":
        data = await handleListTabs(params);
        break;
      case "switch-tab":
        data = await handleSwitchTab(params);
        break;
      case "close-tab":
        data = await handleCloseTab(params);
        break;
      default:
        sendError(id, `Unknown command: ${command}`);
        return;
    }
    sendSuccess(id, data);
  } catch (err) {
    sendError(id, err.message || String(err));
  }
};

// ---------------------------------------------------------------------------
// Debug info for extension debug page (Plan 02)
// ---------------------------------------------------------------------------

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "get-debug-info") {
    sendResponse({
      connected: port !== null,
      recentMessages: recentMessages.slice(),
      nativeAppName: NATIVE_APP_NAME,
    });
    // Return true for async response compatibility (not strictly needed here)
    return true;
  }
});

console.log("[Raycast Firefox] Background script loaded");
