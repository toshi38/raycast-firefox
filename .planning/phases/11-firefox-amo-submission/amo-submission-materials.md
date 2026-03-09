# AMO Submission Materials

Prepared for Firefox AMO Developer Hub submission.

## Zip File

```
extension/web-ext-artifacts/raycast_tab_manager_for_firefox-1.0.0.zip
```

## AMO Developer Hub Fields

| Field | Value |
|-------|-------|
| **Name** | Raycast Tab Manager for Firefox (auto-detected from manifest) |
| **Category** | Tabs |
| **License** | MIT |
| **Homepage** | https://github.com/toshi38/raycast-firefox |

## Summary

(Short, shown in search results)

```
Companion extension for Raycast tab management. Enables searching and switching Firefox tabs from Raycast.
```

## Description

(Shown on listing page)

```
Raycast Tab Manager for Firefox is a companion extension that enables
Raycast (https://raycast.com) to search and switch your Firefox tabs.

## What it does
- Allows Raycast to list all open Firefox tabs
- Enables instant tab switching from Raycast's search bar
- Supports Firefox Container Tabs (Multi-Account Containers)
- Supports tab closing from Raycast

## How it works
This extension communicates with a local native messaging host
(installed separately via Raycast). All communication stays on your
local machine -- no data is sent to any external server.

## Setup
For setup instructions, see:
https://github.com/toshi38/raycast-firefox

## Permissions explained
- **tabs**: Read tab titles and URLs to display in Raycast
- **nativeMessaging**: Communicate with the local bridge process
- **contextualIdentities, cookies**: Show Firefox Container metadata

## Privacy
This extension does not collect, store, or transmit any personal data.
All communication occurs locally via native messaging (stdin/stdout)
and localhost HTTP.

Source code: https://github.com/toshi38/raycast-firefox
```

Note: The setup link points to the GitHub repo README (per user decision -- LINK-01 interim). After Phase 13 ships the Raycast Store listing, this will be updated to the Raycast Store URL.

## Reviewer Notes

```
This extension is a companion to a Raycast (https://raycast.com)
extension for tab management. It communicates with a local native
messaging host via browser.runtime.connectNative().

Architecture:
1. Raycast extension sends HTTP request to localhost:26394
2. Native host forwards request to this Firefox extension via native
   messaging (stdin/stdout)
3. This extension queries browser.tabs and returns results
4. Native host sends response back to Raycast over localhost HTTP

No data leaves the user's machine. The native host source code is
available at: https://github.com/toshi38/raycast-firefox/tree/main/native-host

The extension uses "nativeMessaging" permission to communicate with
the local native host only. The "tabs" permission is used to read
tab metadata (titles, URLs) for display in Raycast's search interface.
"contextualIdentities" and "cookies" are used to show Firefox Container
tab metadata.

data_collection_permissions is set to "none" because all communication
is local (native messaging + localhost HTTP). No data is transmitted to
external servers.
```
