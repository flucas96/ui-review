import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AnnotationClaimConflictError,
  AnnotationClaimRequiredError,
  AnnotationClaimStore,
} from "./annotation-claims.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("AnnotationClaimStore", () => {
  it("allows exactly one of two concurrent agent sessions to claim an annotation", async () => {
    const directory = await createDirectory();
    const firstStore = new AnnotationClaimStore(directory);
    const secondStore = new AnnotationClaimStore(directory);

    const results = await Promise.allSettled([
      firstStore.claim("annotation-1", "agent-a", 60_000),
      secondStore.claim("annotation-1", "agent-b", 60_000),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(AnnotationClaimConflictError) });
  });

  it("renews the current owner's lease without changing its initial claim time", async () => {
    let now = new Date("2026-07-23T10:00:00.000Z");
    const store = new AnnotationClaimStore(await createDirectory(), () => now);
    const first = await store.claim("annotation-1", "agent-a", 60_000);
    now = new Date("2026-07-23T10:00:30.000Z");

    const renewed = await store.claim("annotation-1", "agent-a", 60_000);

    expect(renewed.claimedAt).toBe(first.claimedAt);
    expect(renewed.expiresAt).toBe("2026-07-23T10:01:30.000Z");
  });

  it("allows another session to acquire an expired lease", async () => {
    let now = new Date("2026-07-23T10:00:00.000Z");
    const store = new AnnotationClaimStore(await createDirectory(), () => now);
    await store.claim("annotation-1", "agent-a", 1_000);
    now = new Date("2026-07-23T10:00:02.000Z");

    const claim = await store.claim("annotation-1", "agent-b", 60_000);

    expect(claim.agentId).toBe("agent-b");
  });

  it("guards mutations and releases by lease ownership", async () => {
    const store = new AnnotationClaimStore(await createDirectory());
    await store.claim("annotation-1", "agent-a", 60_000);

    await expect(store.runAsOwner("annotation-1", "agent-b", async () => "changed"))
      .rejects.toBeInstanceOf(AnnotationClaimConflictError);
    await expect(store.runAsOwner("annotation-2", "agent-a", async () => "changed"))
      .rejects.toBeInstanceOf(AnnotationClaimRequiredError);
    await expect(store.runAsOwner("annotation-1", "agent-a", async () => "changed"))
      .resolves.toBe("changed");
    await expect(store.release("annotation-1", "agent-a")).resolves.toBe(true);
    await expect(store.get("annotation-1")).resolves.toBeUndefined();
  });
});

async function createDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ui-review-claims-"));
  temporaryDirectories.push(directory);
  return directory;
}
