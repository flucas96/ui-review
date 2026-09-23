import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import type { CreateAnnotationInput } from "../shared/types.js";
import { ReviewEventStore } from "../server/event-store.js";
import { startReviewServer, type RunningReviewServer } from "../server/review-server.js";
import { createMcpServer } from "./server.js";

const temporaryDirectories: string[] = [];
const runningServers: RunningReviewServer[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(runningServers.splice(0).map((server) => server.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("MCP server feedback roots", () => {
  it("serves feedback written by a review proxy whose root differs from the MCP root", async () => {
    const directory = await createDirectory();
    const registry = join(directory, "home", ".ui-review", "roots.json");
    const mcpRoot = join(directory, "home");
    const proxyRoot = join(directory, "desktop");
    await mkdir(proxyRoot, { recursive: true });
    await writeFile(join(proxyRoot, "adr.html"), "<!doctype html><body><main>ADR</main></body>");
    const review = await startReviewServer({
      appId: "adr-018",
      feedbackRootRegistry: registry,
      port: 0,
      projectRoot: proxyRoot,
      target: join(proxyRoot, "adr.html"),
    });
    runningServers.push(review);
    const response = await fetch(`${review.url}/__ui_review/annotations`, {
      body: JSON.stringify(annotationInput("adr-018", "Clarify the decision")),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(201);

    const client = await connect(mcpRoot, registry);
    const listed = await callTool(client, "ui_review_list_annotations", { appId: "adr-018" });
    expect(listed.annotations).toHaveLength(1);
    const annotationId = String(listed.annotations[0]?.id);

    const detail = await callTool(client, "ui_review_get_annotation", { annotationId });
    expect(detail.feedbackRoot).toBe(proxyRoot);
    await callTool(client, "ui_review_claim_annotation", { annotationId });
    await callTool(client, "ui_review_set_status", { annotationId, status: "in_progress" });
    await callTool(client, "ui_review_reply", { annotationId, message: "Clarified the decision." });
    await callTool(client, "ui_review_set_status", { annotationId, status: "review" });
    expect(await callTool(client, "ui_review_release_annotation", { annotationId })).toMatchObject({ released: true });

    const proxyAnnotation = await new ReviewEventStore(proxyRoot).get(annotationId);
    expect(proxyAnnotation.status).toBe("review");
    expect(proxyAnnotation.messages.map((message) => message.author)).toEqual(["user", "agent"]);
    expect(await readFile(join(mcpRoot, ".ui-review", "events.jsonl"), "utf8")).toBe("");
    expect((await stat(join(proxyRoot, ".ui-review", "claims"))).isDirectory()).toBe(true);
    expect(await readdir(join(mcpRoot, ".ui-review", "claims"))).toEqual([]);
  });

  it("keeps serving the MCP project root when no review session has been registered", async () => {
    const directory = await createDirectory();
    const store = new ReviewEventStore(directory);
    await store.initialize();
    const created = await store.create(annotationInput("dashboard", "Tighten spacing"));

    const client = await connect(directory, join(directory, "missing", "roots.json"));
    const listed = await callTool(client, "ui_review_list_annotations", {});
    await callTool(client, "ui_review_claim_annotation", { annotationId: created.id });
    await callTool(client, "ui_review_reply", { annotationId: created.id, message: "Done." });

    expect(listed.annotations.map((annotation) => annotation.id)).toEqual([created.id]);
    expect((await store.get(created.id)).messages).toHaveLength(2);
  });

  it("skips registered roots whose feedback directory no longer exists", async () => {
    const directory = await createDirectory();
    const registry = join(directory, "roots.json");
    await writeFile(registry, JSON.stringify({ roots: [join(directory, "deleted-project")] }));

    const client = await connect(join(directory, "project"), registry);

    await expect(callTool(client, "ui_review_list_annotations", {})).resolves.toEqual({ annotations: [] });
  });
});

async function connect(projectRoot: string, registryPath: string): Promise<Client> {
  const server = await createMcpServer(projectRoot, registryPath);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "ui-review-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  clients.push(client);
  return client;
}

type ToolPayload = {
  readonly annotations: readonly { readonly id?: unknown }[];
  readonly [key: string]: unknown;
};

async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<ToolPayload> {
  const result = await client.callTool({ arguments: args, name });
  const content = result.content;
  if (result.isError === true || !Array.isArray(content)) {
    throw new Error(`Tool ${name} failed: ${JSON.stringify(result)}`);
  }
  const [first] = content;
  if (first === undefined || first.type !== "text") {
    throw new Error(`Tool ${name} returned no text content`);
  }
  return JSON.parse(first.text) as ToolPayload;
}

async function createDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ui-review-mcp-"));
  temporaryDirectories.push(directory);
  return directory;
}

function annotationInput(appId: string, comment: string): CreateAnnotationInput {
  return {
    appId,
    comment,
    pageTitle: "Fixture",
    pageUrl: "/",
    target: {
      boundingBox: { height: 120, width: 240, x: 20, y: 40 },
      shape: "rectangle",
      type: "region",
      viewport: { height: 900, scrollX: 0, scrollY: 0, width: 1440 },
    },
  };
}
