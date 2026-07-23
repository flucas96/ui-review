import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { annotationStatuses } from "../shared/types.js";
import { uiReviewVersion } from "../shared/version.js";
import { ReviewEventStore } from "../server/event-store.js";
import { agentSessionId } from "./agent-session.js";
import { AnnotationClaimStore } from "./annotation-claims.js";
import { presentAnnotation, presentClaim, summarizeAnnotation } from "./presentation.js";

const annotationStatusSchema = z.enum(annotationStatuses);

/** Run the stdio MCP bridge for a project's persisted review feedback. */
export async function runMcpServer(projectRoot: string): Promise<void> {
  const store = new ReviewEventStore(projectRoot);
  const claimStore = new AnnotationClaimStore(projectRoot);
  const agentId = agentSessionId(projectRoot);
  await Promise.all([store.initialize(), claimStore.initialize()]);
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
      const annotations = await store.list(query);
      const summaries = await Promise.all(annotations.map(async (annotation) => summarizeAnnotation(
        annotation,
        presentClaim(await claimStore.get(annotation.id), agentId),
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
    async ({ annotationId }) => toolResult({
      annotation: presentAnnotation(
        await store.get(annotationId),
        presentClaim(await claimStore.get(annotationId), agentId),
      ),
    }),
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
      await store.get(annotationId);
      const claim = await claimStore.claim(annotationId, agentId, leaseMinutes * 60_000);
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
      released: await claimStore.release(annotationId, agentId),
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
      const annotation = await claimStore.runAsOwner(
        annotationId,
        agentId,
        async () => store.setStatus(annotationId, status),
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
      const annotation = await claimStore.runAsOwner(
        annotationId,
        agentId,
        async () => store.addMessage(annotationId, "agent", message),
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
      await claimStore.runAsOwner(annotationId, agentId, async () => store.delete(annotationId));
      await claimStore.release(annotationId, agentId);
      return toolResult({ deleted: annotationId });
    },
  );

  await server.connect(new StdioServerTransport());
}

function toolResult(value: unknown) {
  return {
    content: [{ text: JSON.stringify(value), type: "text" as const }],
  };
}
