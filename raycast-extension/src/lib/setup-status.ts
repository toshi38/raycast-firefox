import { readHosts } from "./hosts";
import { type ProfileStatus, findRunningProfiles, profileStatuses } from "./profile-status";
import { type FirefoxProfile, loadProfiles } from "./profiles";

/**
 * Load every Firefox profile with its setup state, along with the full
 * profile list (for consistent colours and avatars).
 */
export async function loadProfileStatuses(): Promise<{ profiles: FirefoxProfile[]; statuses: ProfileStatus[] }> {
  const [profiles, running] = await Promise.all([loadProfiles(), findRunningProfiles()]);
  const hosts = readHosts();
  let statuses = profileStatuses(
    profiles,
    running,
    hosts.map((h) => h.profilePath)
  );
  // A host that can't say which profile it serves (one from before
  // per-profile records, or whose profile lookup failed) is serving one of
  // the running profiles that have the extension, so don't flag those.
  if (hosts.some((h) => !h.profilePath)) {
    statuses = statuses.map((s) => (s.state === "not-connected" ? { ...s, state: "connected" } : s));
  }
  return { profiles, statuses };
}
