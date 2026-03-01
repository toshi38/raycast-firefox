#!/bin/bash
# run.sh - Wrapper to find Node.js and launch the native messaging host.
# Firefox does not inherit the user's shell PATH, so we probe known
# installation locations in priority order with version checking.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"

# Dual entry point: prefer bundled host, fall back to source for dev
if [ -f "$DIR/host.bundle.js" ]; then
  BUNDLE="$DIR/host.bundle.js"
else
  BUNDLE="$DIR/host.js"
fi

LOG_DIR="$HOME/.raycast-firefox/logs"
MIN_NODE_VERSION=18

mkdir -p "$LOG_DIR"

# -- Logging -------------------------------------------------------------------

log_info() {
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") [INFO] $*" >> "$LOG_DIR/wrapper.log"
}

log_and_exit() {
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") [ERROR] $*" >> "$LOG_DIR/wrapper.log"
  echo "ERROR: $*" >&2
  exit 1
}

# -- Version check -------------------------------------------------------------

check_node_version() {
  local node_path="$1"
  local version
  version="$("$node_path" --version 2>/dev/null)" || return 1
  local major
  major=$(echo "$version" | sed 's/^v//' | cut -d. -f1)
  if [ "$major" -ge "$MIN_NODE_VERSION" ] 2>/dev/null; then
    return 0
  else
    log_info "Skipping $node_path ($version): below minimum v$MIN_NODE_VERSION"
    return 1
  fi
}

# -- Try a candidate node ------------------------------------------------------

try_node() {
  local node_path="$1"
  local label="$2"
  if [ -x "$node_path" ] && check_node_version "$node_path"; then
    local version
    version="$("$node_path" --version 2>/dev/null)"
    log_info "Using $label: $node_path ($version)"
    exec "$node_path" "$BUNDLE"
  fi
}

# -- Priority chain ------------------------------------------------------------

# Priority 1: Raycast bundled Node.js
RAYCAST_NODE=$(find "$HOME/Library/Application Support/com.raycast.macos/NodeJS/runtime" -name "node" -type f 2>/dev/null | head -1)
if [ -n "${RAYCAST_NODE:-}" ]; then
  try_node "$RAYCAST_NODE" "Raycast bundled"
fi

# Priority 2: Homebrew ARM (Apple Silicon)
try_node "/opt/homebrew/bin/node" "Homebrew ARM"

# Priority 3: Homebrew Intel
try_node "/usr/local/bin/node" "Homebrew Intel"

# Priority 4: nvm (latest installed version)
NVM_NODE=$(ls -d "$HOME/.nvm/versions/node"/v*/bin/node 2>/dev/null | sort -V | tail -1 || true)
if [ -n "${NVM_NODE:-}" ]; then
  try_node "$NVM_NODE" "nvm"
fi

# Priority 5: system PATH
SYSTEM_NODE=$(command -v node 2>/dev/null || true)
if [ -n "${SYSTEM_NODE:-}" ]; then
  try_node "$SYSTEM_NODE" "system PATH"
fi

# -- No suitable Node.js found ------------------------------------------------

log_and_exit "No suitable Node.js (>= v$MIN_NODE_VERSION) found. Checked: Raycast bundled, /opt/homebrew/bin/node, /usr/local/bin/node, nvm, system PATH."
