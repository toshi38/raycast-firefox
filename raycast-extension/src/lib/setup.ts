import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { environment } from "@raycast/api";

// -- Firefox detection --

/**
 * Check if Firefox.app is installed on macOS.
 * Simple path check — macOS only (Raycast is macOS-only).
 */
export function isFirefoxInstalled(): boolean {
  return existsSync("/Applications/Firefox.app");
}

// -- Path resolution --

/**
 * Resolve the absolute path to native-host/run.sh.
 *
 * Reads the project root from assets/project-root.txt (written at build time
 * by the prebuild script) and resolves native-host/run.sh from there.
 */
export function resolveNativeHostPath(): string {
  const rootFile = join(environment.assetsPath, "project-root.txt");
  if (!existsSync(rootFile)) {
    throw new Error(
      "Missing assets/project-root.txt. Rebuild the extension with npm run build.",
    );
  }
  const projectRoot = readFileSync(rootFile, "utf-8").trim();
  const candidate = join(projectRoot, "native-host", "run.sh");
  if (!existsSync(candidate)) {
    throw new Error(`Could not locate native-host/run.sh at ${candidate}`);
  }
  return resolve(candidate);
}

// -- Manifest generation --

/**
 * Generate the native messaging host manifest JSON string.
 */
export function generateManifest(runShPath: string): string {
  return JSON.stringify(
    {
      name: "raycast_firefox",
      description: "Raycast Firefox tab management bridge",
      path: runShPath,
      type: "stdio",
      allowed_extensions: ["raycast-firefox@lau.engineering"],
    },
    null,
    2,
  );
}

// -- Manifest writing --

/**
 * Write the native messaging host manifest to the Firefox NativeMessagingHosts
 * directory.
 *
 * Creates the directory if it doesn't exist. Returns the absolute path where
 * the manifest was written.
 */
export function writeManifest(manifestJson: string): string {
  const targetDir = join(
    homedir(),
    "Library",
    "Application Support",
    "Mozilla",
    "NativeMessagingHosts",
  );
  mkdirSync(targetDir, { recursive: true });
  const manifestPath = join(targetDir, "raycast_firefox.json");
  writeFileSync(manifestPath, manifestJson, "utf-8");
  return manifestPath;
}

// -- Manifest validation --

/**
 * Validate that the written manifest file is correct:
 * - Exists and parses as valid JSON
 * - Has the correct name ("raycast_firefox")
 * - Has the expected path to run.sh
 * - The path points to an existing, executable file
 */
export function validateManifest(
  manifestPath: string,
  expectedRunShPath: string,
): { valid: boolean; error?: string } {
  try {
    const content = readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as { name?: string; path?: string };

    if (manifest.name !== "raycast_firefox") {
      return {
        valid: false,
        error: `Manifest name is "${manifest.name}", expected "raycast_firefox"`,
      };
    }

    if (manifest.path !== expectedRunShPath) {
      return {
        valid: false,
        error: `Manifest path is "${manifest.path}", expected "${expectedRunShPath}"`,
      };
    }

    try {
      accessSync(manifest.path, constants.X_OK);
    } catch {
      return {
        valid: false,
        error: `run.sh at "${manifest.path}" is not executable`,
      };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Failed to read/parse manifest: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// -- Chain verification --

/**
 * Verify the full communication chain by pinging the native host HTTP server.
 *
 * - Hit /health to check if the host is reachable
 * - If healthy, hit /tabs to check if the WebExtension is connected
 * - Catches all errors gracefully (connection refused, timeout, etc.)
 */
export async function verifyChain(
  port: number,
): Promise<{ reachable: boolean; tabsOk: boolean }> {
  try {
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!healthRes.ok) {
      return { reachable: false, tabsOk: false };
    }

    try {
      const tabsRes = await fetch(`http://127.0.0.1:${port}/tabs`, {
        signal: AbortSignal.timeout(3000),
      });
      return { reachable: true, tabsOk: tabsRes.ok };
    } catch {
      return { reachable: true, tabsOk: false };
    }
  } catch {
    return { reachable: false, tabsOk: false };
  }
}

// -- Port discovery --

/**
 * Read the HTTP server port from ~/.raycast-firefox/port.
 * Falls back to 26394 on any error (file missing, parse failure).
 */
export function getPort(): number {
  try {
    const portPath = join(homedir(), ".raycast-firefox", "port");
    const content = readFileSync(portPath, "utf-8").trim();
    const port = parseInt(content, 10);
    if (Number.isNaN(port) || port <= 0 || port > 65535) {
      return 26394;
    }
    return port;
  } catch {
    return 26394;
  }
}
