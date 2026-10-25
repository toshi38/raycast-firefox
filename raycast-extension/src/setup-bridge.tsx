import { Action, ActionPanel, Color, Icon, List, Toast, showToast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useCallback, useEffect, useState } from "react";
import { installNativeHost } from "./lib/installer";
import { profilesNeedingSetup } from "./lib/profile-status";
import { ProfileSetupItem, SetupAction } from "./lib/profile-ui";
import {
  generateManifest,
  installedHostVersion,
  isFirefoxInstalled,
  isNativeHostRegistered,
  resolveNativeHostPath,
  validateManifest,
  writeManifest,
} from "./lib/setup";
import { loadProfileStatuses } from "./lib/setup-status";
import { useHostsWatcher } from "./lib/use-hosts-watcher";

/**
 * Download the native host, register it with Firefox and validate the
 * registration. Reports progress and failures in `toast`. Returns whether
 * the host is now registered.
 */
async function installAndRegister(toast: Toast): Promise<boolean> {
  try {
    await installNativeHost((message) => {
      toast.message = message;
    });
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Installation Failed";
    toast.message = err instanceof Error ? err.message : String(err);
    return false;
  }

  let runShPath: string;
  try {
    runShPath = resolveNativeHostPath();
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Setup Failed";
    toast.message = err instanceof Error ? err.message : String(err);
    return false;
  }

  let manifestPath: string;
  try {
    manifestPath = writeManifest(generateManifest(runShPath));
  } catch {
    toast.style = Toast.Style.Failure;
    toast.title = "Couldn't Write Manifest";
    toast.message = "Check permissions on ~/Library/Application Support/Mozilla/";
    return false;
  }

  const validation = validateManifest(manifestPath, runShPath);
  if (!validation.valid) {
    toast.style = Toast.Style.Failure;
    toast.title = "Manifest Validation Failed";
    toast.message = validation.error ?? "Unknown validation error";
    return false;
  }
  return true;
}

export default function SetupBridge() {
  const [host, setHost] = useState(() => ({
    registered: isNativeHostRegistered(),
    version: installedHostVersion(),
  }));
  const [installing, setInstalling] = useState(false);
  const firefoxInstalled = isFirefoxInstalled();

  const { data: setup, isLoading, revalidate } = usePromise(loadProfileStatuses, []);
  useHostsWatcher(revalidate);

  const install = useCallback(async () => {
    setInstalling(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Installing Firefox Bridge",
      message: "Downloading native host...",
    });
    const ok = await installAndRegister(toast);
    setHost({ registered: isNativeHostRegistered(), version: installedHostVersion() });
    setInstalling(false);
    if (!ok) return;

    const { statuses } = await loadProfileStatuses();
    revalidate();
    const pending = profilesNeedingSetup(statuses);
    toast.style = Toast.Style.Success;
    toast.title = "Firefox Bridge Installed";
    toast.message =
      pending.length > 0
        ? `${pending.length} running profile${pending.length === 1 ? " needs" : "s need"} the companion extension`
        : "Restart Firefox if your tabs don't appear";
  }, [revalidate]);

  // Setting up is what this command is for, so install straight away when
  // Firefox can't launch the native host yet.
  useEffect(() => {
    if (firefoxInstalled && !host.registered) install();
  }, []);

  if (!firefoxInstalled) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Globe}
          title="Firefox Not Detected"
          description="Install Firefox in /Applications, then run this command again."
        />
      </List>
    );
  }

  const statuses = setup?.statuses ?? [];
  const profiles = setup?.profiles ?? [];
  // Running profiles first, then the rest in Firefox's order.
  const ordered = [...statuses].sort((a, b) => Number(b.firefoxPid !== null) - Number(a.firefoxPid !== null));

  const refresh = (
    <Action
      title="Refresh"
      icon={Icon.ArrowClockwise}
      shortcut={{ modifiers: ["cmd"], key: "r" }}
      onAction={() => {
        setHost({ registered: isNativeHostRegistered(), version: installedHostVersion() });
        revalidate();
      }}
    />
  );
  const installAction = (
    <Action
      title={host.registered ? "Reinstall Native Host" : "Install Native Host"}
      icon={Icon.Download}
      onAction={install}
    />
  );

  return (
    <List isLoading={isLoading || installing}>
      <List.Section title="Native Host">
        <List.Item
          icon={Icon.Terminal}
          title="Native Host"
          subtitle={
            host.registered
              ? `Registered with Firefox${host.version ? `, version ${host.version}` : ""}`
              : "Not installed"
          }
          accessories={[
            host.registered
              ? { tag: { value: "Installed", color: Color.Green } }
              : { tag: { value: installing ? "Installing" : "Missing", color: Color.Orange } },
          ]}
          actions={
            <ActionPanel>
              {installAction}
              {refresh}
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Firefox Profiles" subtitle="Each profile needs its own copy of the companion extension">
        {ordered.map((status) => (
          <ProfileSetupItem
            key={status.profile.path}
            status={status}
            profiles={profiles}
            actions={
              <ActionPanel>
                <SetupAction status={status} inSetupCommand />
                {status.state === "not-connected" && installAction}
                {refresh}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
