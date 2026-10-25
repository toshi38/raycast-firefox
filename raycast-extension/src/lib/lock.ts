import { mkdirSync, rmSync, statSync } from "fs";

/**
 * Run `fn` holding a lock shared by every Raycast command, so two commands
 * (each with its own copy of this module) never install or restart the
 * native host at the same time. The lock is a directory: creating it is
 * atomic. A lock older than `staleMs` is left from a run that died and is
 * taken over. Returns `{ ran: false }` without running `fn` when another
 * command holds the lock.
 */
export async function withLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  { staleMs = 5 * 60 * 1000, now = () => Date.now() } = {}
): Promise<{ ran: true; value: T } | { ran: false }> {
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let age = 0;
    try {
      age = now() - statSync(lockPath).mtimeMs;
    } catch {
      // Released in the meantime
    }
    if (age < staleMs) return { ran: false };
    rmSync(lockPath, { recursive: true, force: true });
    try {
      mkdirSync(lockPath);
    } catch {
      return { ran: false };
    }
  }
  try {
    return { ran: true, value: await fn() };
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}
