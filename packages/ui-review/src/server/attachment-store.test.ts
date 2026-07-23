import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AttachmentNotFoundError, ScreenshotAttachmentStore } from "./attachment-store.js";

const temporaryDirectories: string[] = [];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("ScreenshotAttachmentStore", () => {
  it("persists validated image bytes outside the event log", async () => {
    const store = await createStore();

    const screenshot = await store.save({
      body: pngSignature,
      fileName: "dashboard.png",
      height: 720,
      mimeType: "image/png",
      width: 1280,
    });
    const saved = await store.read(screenshot.id);

    expect(screenshot).toMatchObject({
      byteSize: pngSignature.byteLength,
      fileName: "dashboard.png",
      height: 720,
      mimeType: "image/png",
      width: 1280,
    });
    expect(saved.body).toEqual(pngSignature);
    expect(saved.mimeType).toBe("image/png");
  });

  it("rejects a MIME type that does not match the uploaded bytes", async () => {
    const store = await createStore();

    await expect(store.save({
      body: Buffer.from("not an image"),
      fileName: "fake.png",
      height: 10,
      mimeType: "image/png",
      width: 10,
    })).rejects.toThrow("valid PNG, JPEG, or WebP");
  });

  it("does not resolve paths outside the attachment directory", async () => {
    const store = await createStore();

    await expect(store.read("../events.jsonl")).rejects.toBeInstanceOf(AttachmentNotFoundError);
  });
});

async function createStore(): Promise<ScreenshotAttachmentStore> {
  const directory = await mkdtemp(join(tmpdir(), "ui-review-attachments-"));
  temporaryDirectories.push(directory);
  const store = new ScreenshotAttachmentStore(directory);
  await store.initialize();
  return store;
}
