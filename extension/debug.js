/**
 * Raycast Firefox - Debug Page Script
 *
 * Communicates with the background script to display native messaging
 * connection status and recent message history for troubleshooting.
 */

"use strict";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const statusIndicator = document.getElementById("status-indicator");
const statusText = document.getElementById("status-text");
const nativeAppNameEl = document.getElementById("native-app-name");
const messageLog = document.getElementById("message-log");
const btnRefresh = document.getElementById("btn-refresh");
const btnAutoRefresh = document.getElementById("btn-auto-refresh");
const errorBanner = document.getElementById("error-banner");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let autoRefreshEnabled = false;
let autoRefreshTimer = null;
const AUTO_REFRESH_INTERVAL = 2000;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a unix timestamp (ms) into a readable time string.
 */
const formatTimestamp = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds()) +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
};

/**
 * Attempt to pretty-print a value as JSON.
 */
const formatJson = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value);
  }
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/**
 * Remove all child nodes from an element.
 */
const clearElement = (el) => {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const showError = (msg) => {
  errorBanner.textContent = msg;
  errorBanner.style.display = "block";
};

const hideError = () => {
  errorBanner.style.display = "none";
};

/**
 * Render the debug info received from the background script.
 */
const renderDebugInfo = (info) => {
  hideError();

  // Connection status
  const connected = info.connected;
  statusIndicator.className =
    "status-indicator " + (connected ? "connected" : "disconnected");
  statusText.textContent = connected ? "Connected" : "Disconnected";

  // Native app name
  if (info.nativeAppName) {
    nativeAppNameEl.textContent = "Native app: " + info.nativeAppName;
  }

  // Recent messages
  const messages = info.recentMessages || [];
  clearElement(messageLog);

  if (messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No messages yet.";
    messageLog.appendChild(empty);
    return;
  }

  // Build message list (newest at top)
  const fragment = document.createDocumentFragment();
  for (let i = messages.length - 1; i >= 0; i--) {
    const entry = messages[i];
    const row = document.createElement("div");
    row.className = "message-entry";

    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = formatTimestamp(entry.timestamp);

    const dir = document.createElement("span");
    dir.className = "msg-direction " + entry.direction;
    dir.textContent = entry.direction === "out" ? "->" : "<-";
    dir.title = entry.direction === "out" ? "Outbound" : "Inbound";

    const content = document.createElement("span");
    content.className = "msg-content";
    content.textContent = formatJson(entry.message);

    row.appendChild(time);
    row.appendChild(dir);
    row.appendChild(content);
    fragment.appendChild(row);
  }

  messageLog.appendChild(fragment);
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

const fetchDebugInfo = () => {
  browser.runtime
    .sendMessage({ type: "get-debug-info" })
    .then((response) => {
      if (response) {
        renderDebugInfo(response);
      } else {
        showError("Background script returned empty response.");
      }
    })
    .catch((err) => {
      showError(
        "Unable to connect to background script: " + (err.message || err)
      );
    });
};

// ---------------------------------------------------------------------------
// Auto-refresh
// ---------------------------------------------------------------------------

const toggleAutoRefresh = () => {
  autoRefreshEnabled = !autoRefreshEnabled;

  if (autoRefreshEnabled) {
    btnAutoRefresh.textContent = "Auto-refresh: On";
    btnAutoRefresh.classList.add("active");
    autoRefreshTimer = setInterval(fetchDebugInfo, AUTO_REFRESH_INTERVAL);
  } else {
    btnAutoRefresh.textContent = "Auto-refresh: Off";
    btnAutoRefresh.classList.remove("active");
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }
};

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

btnRefresh.addEventListener("click", fetchDebugInfo);
btnAutoRefresh.addEventListener("click", toggleAutoRefresh);

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

fetchDebugInfo();
