import { mkdir, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

const lockRetryMilliseconds = 15;
const lockTimeoutMilliseconds = 2_000;
const staleLockMilliseconds = 10_000;

/** Run one filesystem operation under a cross-process directory lock. */
export async function withFileMutex<T>(lockPath: string, operation: () => Promise<T>): Promise<T> {
  await mkdir(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + lockTimeoutMilliseconds;

  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error: unknown) {
      if (!isNodeError(error, "EEXIST")) {
        throw error;
      }
      if (await isStale(lockPath)) {
        await rm(lockPath, { force: true, recursive: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for file lock: ${lockPath}`);
      }
      await wait(lockRetryMilliseconds);
    }
  }

  try {
    return await operation();
  } finally {
    await rm(lockPath, { force: true, recursive: true });
  }
}

async function isStale(lockPath: string): Promise<boolean> {
  try {
    const lockStat = await stat(lockPath);
    return Date.now() - lockStat.mtimeMs > staleLockMilliseconds;
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolveWait) => setTimeout(resolveWait, milliseconds));
}
