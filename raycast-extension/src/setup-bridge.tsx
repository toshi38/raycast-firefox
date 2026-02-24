import { showHUD, showToast, Toast } from "@raycast/api";
import {
  generateManifest,
  getPort,
  isFirefoxInstalled,
  resolveNativeHostPath,
  validateManifest,
  verifyChain,
  writeManifest,
} from "./lib/setup";

export default async function Command() {
  try {
    // 1. Pre-flight: Firefox installed?
    if (!isFirefoxInstalled()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Firefox Not Detected",
        message: "Install Firefox first, then re-run this command.",
      });
      return;
    }

    // 2. Resolve native host path
    let runShPath: string;
    try {
      runShPath = resolveNativeHostPath();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Setup Failed",
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // 3. Generate and write manifest
    let manifestPath: string;
    try {
      const manifestJson = generateManifest(runShPath);
      manifestPath = writeManifest(manifestJson);
    } catch {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't Write Manifest",
        message: "Check permissions on ~/Library/Application Support/Mozilla/",
      });
      return;
    }

    // 4. Validate manifest
    const validation = validateManifest(manifestPath, runShPath);
    if (!validation.valid) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Manifest Validation Failed",
        message: validation.error ?? "Unknown validation error",
      });
      return;
    }

    // 5. Chain verification (best-effort)
    const port = getPort();
    const chain = await verifyChain(port);

    if (chain.reachable && chain.tabsOk) {
      // Full chain working — show HUD (Raycast closes)
      await showHUD("Firefox integration ready!");
    } else if (chain.reachable && !chain.tabsOk) {
      // Host is running but tabs endpoint failed
      await showToast({
        style: Toast.Style.Failure,
        title: "Setup Incomplete",
        message:
          "Host not responding. Ensure Firefox is running and the companion extension is installed.",
      });
    } else {
      // Firefox not running or host not started yet — manifest is installed correctly
      await showToast({
        style: Toast.Style.Success,
        title: "Manifest Installed",
        message:
          "Start Firefox with the companion extension to complete setup.",
      });
    }
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Setup Failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
