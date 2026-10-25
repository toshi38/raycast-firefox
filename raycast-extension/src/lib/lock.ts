import { mkdirSync, renameSync, rmSync, statSync } from "fs";
import { dirname } from "path";

/**
 * Run `fn` holding a lock shared by every Raycast command, so two commands
 * (each with its own copy of this module) never install or restart the
 * native host at the same time. Returns `{ ran: false }` without running
 * `fn` when another command holds the lock.
 *
 * The lock is a directory, because creating one is atomic. Its parent is
 * created first, since on a fresh machine nothing has made
 * ~/.raycast-firefox yet. A lock older than `staleMs` is left by a run that
 * died; it is taken over by renaming it aside, which only one command can
 * do, so two commands can't both take it over.
 */
export async function withLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  { staleMs = 5 * 60 * 1000, now = () => Date.now() } = {}
): Promise<{ ran: true; value: T } | { ran: false }> {
  mkdirSync(dirname(lockPath), { recursive: true });
  if (!acquire(lockPath, staleMs, now)) return { ran: false };
  try {
    return { ran: true, value: await fn() };
  } finally {
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

function acquire(lockPath: string, staleMs: number, now: () => number): boolean {
  // Two attempts: the second covers a lock released or taken over between
  // checks.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (tryCreate(lockPath)) return true;
    let mtime: number;
    try {
      mtime = statSync(lockPath).mtimeMs;
    } catch {
      continue; // Released in the meantime: try again
    }
    if (now() - mtime < staleMs) return false;
    const aside = `${lockPath}.stale-${process.pid}-${Math.random().toString(36).slice(2)}`;
    try {
      renameSync(lockPath, aside);
    } catch {
      continue; // Another command took it over first: try again
    }
    rmSync(aside, { recursive: true, force: true });
  }
  return tryCreate(lockPath);
}
