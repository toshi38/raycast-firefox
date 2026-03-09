# Raycast Tab Manager for Firefox

Search and switch Firefox tabs from Raycast.

## What It Does

- List all open Firefox tabs across windows
- Instantly switch to any tab by searching its title or URL
- Close tabs without leaving Raycast
- Supports Firefox Container Tabs (Multi-Account Containers)

## Components

This project has three parts that work together:

1. **Firefox extension** -- runs inside Firefox and exposes tab data
2. **Native messaging host** -- a local bridge that connects Raycast to Firefox
3. **Raycast extension** -- the Raycast interface for searching and managing tabs

## Setup

1. **Install the Firefox extension** from [Firefox Add-ons](https://addons.mozilla.org) *(link will be updated once the listing is live)*
2. **Install the Raycast extension** from the [Raycast Store](https://raycast.com/store) *(link will be updated once published)*
3. **Run the "Setup Firefox Bridge" command** in Raycast -- this installs the native messaging host that connects Raycast to Firefox

That's it. After setup, use the "Search Firefox Tabs" command in Raycast to find and switch tabs.

## How It Works

All communication stays on your machine:

```
Raycast --> Native Host (localhost) --> Firefox Extension (native messaging)
```

The Raycast extension connects to a local native messaging host over HTTP on localhost. The native host communicates with the Firefox extension using Firefox's native messaging API. No data leaves your computer.

## Permissions

The Firefox extension requests these permissions:

- **tabs** -- read tab titles and URLs to display in Raycast
- **nativeMessaging** -- communicate with the local native messaging host
- **contextualIdentities** -- read Firefox Container Tab identities
- **cookies** -- required alongside contextualIdentities to access container information

## Privacy

This extension does not collect, transmit, or store any user data. All communication between Raycast, the native host, and Firefox happens locally on your machine. No analytics, no telemetry, no network requests to external servers.

## License

[MIT](LICENSE)
