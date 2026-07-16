import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CreateAnnotationInput } from "../shared/types.js";
import { AnnotationNotFoundError, ReviewEventStore } from "./event-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("ReviewEventStore", () => {
  it("folds replies and status changes into the current annotation", async () => {
    const store = await createStore();
    const created = await store.create(annotationInput("dashboard", "/reports", "Tighten the chart spacing"));

    await store.addMessage(created.id, "agent", "I updated the chart composition.");
    const updated = await store.setStatus(created.id, "review");

    expect(updated.status).toBe("review");
    expect(updated.messages.map((message) => message.author)).toEqual(["user", "agent"]);
    expect(updated.messages[1]?.text).toBe("I updated the chart composition.");
    expect((await readFile(store.filePath, "utf8")).trim().split("\n")).toHaveLength(3);
  });

  it("isolates annotations by application and route", async () => {
    const store = await createStore();
    await store.create(annotationInput("dashboard", "/", "Dashboard comment"));
    await store.create(annotationInput("marketing", "/", "Marketing comment"));
    await store.create(annotationInput("dashboard", "/settings", "Settings comment"));

    const annotations = await store.list({ appId: "dashboard", pageUrl: "/" });

    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.messages[0]?.text).toBe("Dashboard comment");
  });

  it("removes deleted annotations from the folded view", async () => {
    const store = await createStore();
    const annotation = await store.create(annotationInput("dashboard", "/", "Remove me"));

    await store.delete(annotation.id);

    await expect(store.get(annotation.id)).rejects.toBeInstanceOf(AnnotationNotFoundError);
    await expect(store.list()).resolves.toEqual([]);
  });
});

async function createStore(): Promise<ReviewEventStore> {
  const directory = await mkdtemp(join(tmpdir(), "ui-review-"));
  temporaryDirectories.push(directory);
  const store = new ReviewEventStore(directory);
  await store.initialize();
  return store;
}

function annotationInput(appId: string, pageUrl: string, comment: string): CreateAnnotationInput {
  return {
    appId,
    comment,
    pageTitle: "Fixture",
    pageUrl,
    target: {
      boundingBox: { height: 120, width: 240, x: 20, y: 40 },
      shape: "rectangle",
      type: "region",
      viewport: { height: 900, scrollX: 0, scrollY: 0, width: 1440 },
    },
  };
}
