import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import * as z from "zod/v4";
import { withFileMutex } from "./file-mutex.js";

const registrySchema = z.object({ roots: z.array(z.string().min(1)) });

/** Default user-level registry of every feedback root a review proxy has written to. */
export function defaultFeedbackRootRegistry(home: string = homedir()): string {
  return resolve(home, ".ui-review", "roots.json");
}

/** Return the registered feedback roots, or none when the registry does not exist yet. */
export async function readFeedbackRoots(registryPath: string): Promise<readonly string[]> {
  try {
    return registrySchema.parse(JSON.parse(await readFile(registryPath, "utf8"))).roots;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw new Error(`Invalid UI Review feedback root registry: ${registryPath}`, { cause: error });
  }
}

/** Atomically add one feedback root to the registry without duplicating existing entries. */
export async function registerFeedbackRoot(projectRoot: string, registryPath: string): Promise<void> {
  const root = resolve(projectRoot);
  await mkdir(dirname(registryPath), { recursive: true });
  await withFileMutex(`${registryPath}.lock`, async () => {
    const roots = await readFeedbackRoots(registryPath);
    if (roots.includes(root)) {
      return;
    }
    const temporary = `${registryPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify({ roots: [...roots, root] }, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      await rename(temporary, registryPath);
    } finally {
      await rm(temporary, { force: true });
    }
  });
}
