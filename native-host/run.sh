#!/bin/bash
# run.sh - Wrapper to find node and launch the native messaging host
# Firefox does not inherit the user's shell PATH, so we probe common locations.

DIR="$(cd "$(dirname "$0")" && pwd)"

# Try PATH first (works if node is in standard location)
if command -v node >/dev/null 2>&1; then
  exec node "$DIR/host.js" "$@"
fi

# nvm current symlink
if [ -x "$HOME/.nvm/current/bin/node" ]; then
  exec "$HOME/.nvm/current/bin/node" "$DIR/host.js" "$@"
fi

# nvm versioned install (pick latest)
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_NODE=$(ls -d "$HOME/.nvm/versions/node"/v*/bin/node 2>/dev/null | sort -V | tail -1)
  if [ -n "$NVM_NODE" ] && [ -x "$NVM_NODE" ]; then
    exec "$NVM_NODE" "$DIR/host.js" "$@"
  fi
fi

# Homebrew Intel Mac
if [ -x "/usr/local/bin/node" ]; then
  exec /usr/local/bin/node "$DIR/host.js" "$@"
fi

# Homebrew Apple Silicon
if [ -x "/opt/homebrew/bin/node" ]; then
  exec /opt/homebrew/bin/node "$DIR/host.js" "$@"
fi

echo "ERROR: node not found. Install Node.js and ensure it is in your PATH." >&2
exit 1
