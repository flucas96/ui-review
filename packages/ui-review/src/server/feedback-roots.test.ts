import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultFeedbackRootRegistry, readFeedbackRoots, registerFeedbackRoot } from "./feedback-roots.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("feedback root registry", () => {
  it("lives in the user's .ui-review directory", () => {
    expect(defaultFeedbackRootRegistry("/home/reviewer")).toBe("/home/reviewer/.ui-review/roots.json");
  });

  it("returns no roots before any review session registered one", async () => {
    const directory = await createDirectory();

    await expect(readFeedbackRoots(join(directory, "missing", "roots.json"))).resolves.toEqual([]);
  });

  it("records absolute roots once, even under concurrent registration", async () => {
    const directory = await createDirectory();
    const registry = join(directory, "home", ".ui-review", "roots.json");

    await Promise.all([
      ...Array.from({ length: 10 }, async () => registerFeedbackRoot(join(directory, "desktop"), registry)),
      registerFeedbackRoot(join(directory, "project", "..", "project"), registry),
    ]);
    await registerFeedbackRoot(join(directory, "desktop"), registry);

    const roots = await readFeedbackRoots(registry);
    expect([...roots].sort()).toEqual([join(directory, "desktop"), join(directory, "project")]);
    expect(JSON.parse(await readFile(registry, "utf8"))).toEqual({ roots });
  });

  it("refuses to overwrite a corrupt registry", async () => {
    const directory = await createDirectory();
    const registry = join(directory, "roots.json");
    await writeFile(registry, "not json");

    await expect(registerFeedbackRoot(join(directory, "project"), registry)).rejects.toThrow("Invalid UI Review feedback root registry");
    await expect(readFile(registry, "utf8")).resolves.toBe("not json");
  });
});

async function createDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ui-review-roots-"));
  temporaryDirectories.push(directory);
  return directory;
}
