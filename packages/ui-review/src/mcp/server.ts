import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { annotationStatuses } from "../shared/types.js";
import { ReviewEventStore } from "../server/event-store.js";

const annotationStatusSchema = z.enum(annotationStatuses);

/** Run the stdio MCP bridge for a project's persisted review feedback. */
export async function runMcpServer(projectRoot: string): Promise<void> {
  const store = new ReviewEventStore(projectRoot);
  await store.initialize();
  const server = new McpServer({ name: "ui-review", version: "0.1.0" });

  server.registerTool(
    "ui_review_list_annotations",
    {
      annotations: { openWorldHint: false, readOnlyHint: true },
      description: "List visual UI annotations with their DOM or region context and full discussion threads.",
      inputSchema: {
        appId: z.string().optional().describe("Optional application identity to filter by"),
        pageUrl: z.string().optional().describe("Optional exact page path to filter by"),
        status: annotationStatusSchema.optional().describe("Optional lifecycle status to filter by"),
      },
      title: "List UI review annotations",
    },
    async ({ appId, pageUrl, status }) => {
      const query = {
        ...(appId === undefined ? {} : { appId }),
        ...(pageUrl === undefined ? {} : { pageUrl }),
        ...(status === undefined ? {} : { status }),
      };
      return toolResult({ annotations: await store.list(query) });
    },
  );

  server.registerTool(
    "ui_review_get_annotation",
    {
      annotations: { openWorldHint: false, readOnlyHint: true },
      description: "Get one visual annotation including target metadata and every human or agent reply.",
      inputSchema: { annotationId: z.string().min(1) },
      title: "Get UI review annotation",
    },
    async ({ annotationId }) => toolResult({ annotation: await store.get(annotationId) }),
  );

  server.registerTool(
    "ui_review_set_status",
    {
      annotations: { idempotentHint: true, openWorldHint: false, readOnlyHint: false },
      description: "Set an annotation to open, in progress, ready for review, or resolved.",
      inputSchema: {
        annotationId: z.string().min(1),
        status: annotationStatusSchema,
      },
      title: "Update UI review status",
    },
    async ({ annotationId, status }) => toolResult({ annotation: await store.setStatus(annotationId, status) }),
  );

  server.registerTool(
    "ui_review_reply",
    {
      annotations: { openWorldHint: false, readOnlyHint: false },
      description: "Reply as the coding agent inside a visual annotation thread.",
      inputSchema: {
        annotationId: z.string().min(1),
        message: z.string().trim().min(1).max(20_000),
      },
      title: "Reply to UI review annotation",
    },
    async ({ annotationId, message }) => toolResult({
      annotation: await store.addMessage(annotationId, "agent", message),
    }),
  );

  server.registerTool(
    "ui_review_delete_annotation",
    {
      annotations: { destructiveHint: true, openWorldHint: false, readOnlyHint: false },
      description: "Delete a visual annotation from the current review view while retaining its append-only history.",
      inputSchema: { annotationId: z.string().min(1) },
      title: "Delete UI review annotation",
    },
    async ({ annotationId }) => {
      await store.delete(annotationId);
      return toolResult({ deleted: annotationId });
    },
  );

  await server.connect(new StdioServerTransport());
}

function toolResult(value: unknown) {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: "text" as const }],
  };
}
