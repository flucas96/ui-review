import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { annotationStatuses } from "../shared/types.js";
import { uiReviewVersion } from "../shared/version.js";
import { defaultFeedbackRootRegistry } from "../server/feedback-roots.js";
import { agentSessionId } from "./agent-session.js";
import { FeedbackWorkspace } from "./feedback-workspace.js";
import { presentAnnotation, presentClaim, summarizeAnnotation } from "./presentation.js";

const annotationStatusSchema = z.enum(annotationStatuses);

/** Run the stdio MCP bridge for a project's persisted review feedback. */
export async function runMcpServer(projectRoot: string): Promise<void> {
  const server = await createMcpServer(projectRoot);
  await server.connect(new StdioServerTransport());
}

/**
 * Create the MCP server for the project root plus every feedback root registered by a review proxy,
 * so feedback is reachable regardless of the directory the MCP client was started in.
 */
export async function createMcpServer(
  projectRoot: string,
  registryPath: string = defaultFeedbackRootRegistry(),
): Promise<McpServer> {
  const workspace = new FeedbackWorkspace(projectRoot, registryPath);
  const agentId = agentSessionId(projectRoot);
  const server = new McpServer(
    { name: "ui-review", version: uiReviewVersion },
    {
      instructions: "Claim each visual annotation before editing or mutating it. Read its full thread and target context, move accepted work to in_progress, renew the claim before final updates, reply with the implementation and verification, set it to review, then release the claim. Skip annotations claimed by another session. Only the human reviewer marks items resolved. Never delete annotations unless explicitly requested.",
    },
  );

  server.registerTool(
    "ui_review_list_annotations",
    {
      annotations: { openWorldHint: false, readOnlyHint: true },
      description: "List compact visual annotation summaries. Call ui_review_get_annotation for full target context and discussion before editing.",
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
      const annotations = await workspace.list(query);
      const summaries = await Promise.all(annotations.map(async ({ annotation, root }) => summarizeAnnotation(
        annotation,
        presentClaim(await root.claims.get(annotation.id), agentId),
      )));
      return toolResult({ annotations: summaries });
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
    async ({ annotationId }) => {
      const { annotation, root } = await workspace.locate(annotationId);
      return toolResult({
        annotation: presentAnnotation(annotation, presentClaim(await root.claims.get(annotationId), agentId)),
        feedbackRoot: root.path,
      });
    },
  );

  server.registerTool(
    "ui_review_claim_annotation",
    {
      annotations: { idempotentHint: true, openWorldHint: false, readOnlyHint: false },
      description: "Atomically claim an annotation for this agent session or renew its existing lease. Fails while another session owns a live claim.",
      inputSchema: {
        annotationId: z.string().min(1),
        leaseMinutes: z.number().int().min(5).max(120).default(30),
      },
      title: "Claim UI review annotation",
    },
    async ({ annotationId, leaseMinutes }) => {
      const { root } = await workspace.locate(annotationId);
      const claim = await root.claims.claim(annotationId, agentId, leaseMinutes * 60_000);
      return toolResult({
        annotationId,
        claim: presentClaim(claim, agentId),
      });
    },
  );

  server.registerTool(
    "ui_review_release_annotation",
    {
      annotations: { idempotentHint: true, openWorldHint: false, readOnlyHint: false },
      description: "Release this agent session's annotation claim after handoff or when work is abandoned.",
      inputSchema: { annotationId: z.string().min(1) },
      title: "Release UI review annotation",
    },
    async ({ annotationId }) => toolResult({
      annotationId,
      released: await (await workspace.claimsFor(annotationId)).release(annotationId, agentId),
    }),
  );

  server.registerTool(
    "ui_review_set_status",
    {
      annotations: { idempotentHint: true, openWorldHint: false, readOnlyHint: false },
      description: "Set a claimed annotation to open, in progress, ready for review, or resolved.",
      inputSchema: {
        annotationId: z.string().min(1),
        status: annotationStatusSchema,
      },
      title: "Update UI review status",
    },
    async ({ annotationId, status }) => {
      const { root } = await workspace.locate(annotationId);
      const annotation = await root.claims.runAsOwner(
        annotationId,
        agentId,
        async () => root.store.setStatus(annotationId, status),
      );
      return toolResult({ annotationId: annotation.id, status: annotation.status });
    },
  );

  server.registerTool(
    "ui_review_reply",
    {
      annotations: { openWorldHint: false, readOnlyHint: false },
      description: "Reply as the coding agent inside a claimed visual annotation thread.",
      inputSchema: {
        annotationId: z.string().min(1),
        message: z.string().trim().min(1).max(20_000),
      },
      title: "Reply to UI review annotation",
    },
    async ({ annotationId, message }) => {
      const { root } = await workspace.locate(annotationId);
      const annotation = await root.claims.runAsOwner(
        annotationId,
        agentId,
        async () => root.store.addMessage(annotationId, "agent", message),
      );
      return toolResult({ annotationId: annotation.id, replied: true, status: annotation.status });
    },
  );

  server.registerTool(
    "ui_review_delete_annotation",
    {
      annotations: { destructiveHint: true, openWorldHint: false, readOnlyHint: false },
      description: "Delete a claimed visual annotation from the current review view while retaining its append-only history.",
      inputSchema: { annotationId: z.string().min(1) },
      title: "Delete UI review annotation",
    },
    async ({ annotationId }) => {
      const { root } = await workspace.locate(annotationId);
      await root.claims.runAsOwner(annotationId, agentId, async () => root.store.delete(annotationId));
      await root.claims.release(annotationId, agentId);
      return toolResult({ deleted: annotationId });
    },
  );

  return server;
}

function toolResult(value: unknown) {
  return {
    content: [{ text: JSON.stringify(value), type: "text" as const }],
  };
}
