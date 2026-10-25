import { mkdirSync, renameSync, rmSync, statSync, utimesSync } from "fs";
import { dirname } from "path";

/**
 * Run `fn` holding a lock shared by every Raycast command, so two commands
 * (each with its own copy of this module) never install or restart the
 * native host at the same time. Returns `{ ran: false }` without running
 * `fn` when another command holds the lock.
 *
 * The lock is a directory, because creating one is atomic. Its parent is
 * created first, since on a fresh machine nothing has made
 * ~/.raycast-firefox yet.
 *
 * The holder refreshes the lock's timestamp every `heartbeatMs`, so a lock
 * not refreshed for `staleMs` belongs to a run that died: Raycast quit, or
 * closed the command mid-install, before `finally` released it. (An owner
 * PID wouldn't tell: every command runs inside Raycast's one long-lived
 * Node.js process.) A stale lock is taken over by renaming it aside, then
 * checking that what was moved is the same directory that was found stale.
 * If it isn't, another command took the lock over in the meantime: its lock
 * is put back and this command steps aside.
 */
export async function withLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  {
    staleMs = 15 * 1000,
    heartbeatMs = 2000,
    now = () => Date.now(),
    stat = (path: string): { mtimeMs: number; ino: number } => statSync(path),
  }: {
    staleMs?: number;
    heartbeatMs?: number;
    now?: () => number;
    stat?: (path: string) => { mtimeMs: number; ino: number };
  } = {}
): Promise<{ ran: true; value: T } | { ran: false }> {
  mkdirSync(dirname(lockPath), { recursive: true });
  if (!acquire(lockPath, staleMs, now, stat)) return { ran: false };
  const heartbeat = setInterval(() => {
    try {
      const at = new Date();
      utimesSync(lockPath, at, at);
    } catch {
      // Released or taken over: nothing to refresh
    }
  }, heartbeatMs);
  heartbeat.unref();
  try {
    return { ran: true, value: await fn() };
  } finally {
    clearInterval(heartbeat);
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function tryCreate(lockPath: string): boolean {
  try {
    mkdirSync(lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

function acquire(
  lockPath: string,
  staleMs: number,
  now: () => number,
  stat: (path: string) => { mtimeMs: number; ino: number }
): boolean {
  // Two attempts: the second covers a lock released or taken over between
  // checks.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (tryCreate(lockPath)) return true;
    let found: { mtimeMs: number; ino: number };
    try {
      found = stat(lockPath);
    } catch {
      continue; // Released in the meantime: try again
    }
    if (now() - found.mtimeMs < staleMs) return false;
    const aside = `${lockPath}.stale-${process.pid}-${Math.random().toString(36).slice(2)}`;
    try {
      renameSync(lockPath, aside);
    } catch {
      continue; // Another command took it over first: try again
    }
    if (stat(aside).ino !== found.ino) {
      // Moved another command's fresh lock, not the stale one: put it back.
      try {
        renameSync(aside, lockPath);
      } catch {
        rmSync(aside, { recursive: true, force: true });
      }
      return false;
    }
    rmSync(aside, { recursive: true, force: true });
  }
  return tryCreate(lockPath);
}
