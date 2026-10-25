---
"raycast-firefox-native-host": minor
---

Support several Firefox profiles running at once. Each profile's host now registers itself in `~/.raycast-firefox/hosts/<firefox-pid>.json` with its port and profile directory, only replaces a previous host for the same Firefox process, and only removes files it wrote. Hosts also exit when Firefox closes their native messaging connection.
