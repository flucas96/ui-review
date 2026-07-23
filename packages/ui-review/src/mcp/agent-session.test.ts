import { describe, expect, it } from "vitest";
import { agentSessionId } from "./agent-session.js";

describe("agentSessionId", () => {
  it("stays stable within one agent window and differs between parent processes", () => {
    expect(agentSessionId("/srv/product", {}, 100)).toBe(agentSessionId("/srv/product", {}, 100));
    expect(agentSessionId("/srv/product", {}, 100)).not.toBe(agentSessionId("/srv/product", {}, 101));
  });

  it("uses an explicit identity when the MCP client provides one", () => {
    expect(agentSessionId("/srv/product", { UI_REVIEW_AGENT_ID: "claude-window-a" }, 100))
      .toBe("claude-window-a");
  });
});
