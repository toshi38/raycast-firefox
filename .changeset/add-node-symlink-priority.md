---
"raycast-firefox-native-host": patch
---

Add Node.js symlink priority to run.sh discovery chain

The wrapper script now checks `~/.raycast-firefox/node` as Priority 0 before scanning for Raycast bundled, Homebrew, nvm, or system Node.js. This symlink is created by the Raycast setup command and provides deterministic, fast Node.js discovery.
