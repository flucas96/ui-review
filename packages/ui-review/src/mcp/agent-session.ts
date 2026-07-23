import { createHash } from "node:crypto";
import { resolve } from "node:path";

/** Derive a stable identity for one MCP client process and its parent agent window. */
export function agentSessionId(
  projectRoot: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  parentProcessId: number = process.ppid,
): string {
  const configured = environment.UI_REVIEW_AGENT_ID?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }
  const digest = createHash("sha256")
    .update(`${resolve(projectRoot)}\0${String(parentProcessId)}`)
    .digest("hex")
    .slice(0, 16);
  return `agent-${digest}`;
}
