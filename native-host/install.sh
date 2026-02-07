#!/bin/bash
# install.sh - Install the native messaging manifest for Firefox on macOS.
# This tells Firefox where to find the native messaging host when the
# WebExtension calls browser.runtime.connectNative("raycast_firefox").

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
MANIFEST_FILE="$TARGET_DIR/raycast_firefox.json"
RUN_SH="$DIR/run.sh"

# Verify run.sh exists and is executable
if [ ! -x "$RUN_SH" ]; then
  echo "ERROR: run.sh not found or not executable at $RUN_SH" >&2
  echo "Make sure you are running install.sh from the native-host directory." >&2
  exit 1
fi

# Create target directory
mkdir -p "$TARGET_DIR"

# Write manifest with absolute path to run.sh
cat > "$MANIFEST_FILE" <<MANIFEST
{
  "name": "raycast_firefox",
  "description": "Raycast Firefox tab management bridge",
  "path": "$RUN_SH",
  "type": "stdio",
  "allowed_extensions": ["raycast-firefox@lau.engineering"]
}
MANIFEST

echo "Installed native messaging manifest to $MANIFEST_FILE"
echo "Host path: $RUN_SH"
