import { describe, expect, it } from "vitest";
import type { Annotation } from "../shared/types.js";
import { presentAnnotation, presentClaim, summarizeAnnotation } from "./presentation.js";

const annotation: Annotation = {
  appId: "react-fixture",
  createdAt: "2026-07-20T10:00:00.000Z",
  id: "annotation-1",
  messages: [
    {
      author: "user",
      createdAt: "2026-07-20T10:00:00.000Z",
      id: "message-1",
      text: "Make this card easier to scan. ".repeat(30),
    },
    {
      author: "agent",
      createdAt: "2026-07-20T10:01:00.000Z",
      id: "message-2",
      text: "I will tighten the hierarchy.",
    },
  ],
  pageTitle: "Work",
  pageUrl: "/work?view=cards",
  status: "in_progress",
  target: {
    accessibility: { role: "article" },
    boundingBox: { height: 240, width: 360, x: 20, y: 80 },
    computedStyles: Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`property-${String(index)}`, "value".repeat(20)]),
    ),
    domPath: "main > section > article:nth-of-type(2)",
    nearbyText: "Quarterly planning card with a long description".repeat(20),
    selector: "main > section > article:nth-of-type(2)",
    tagName: "article",
    type: "element",
    viewport: { height: 900, scrollX: 0, scrollY: 120, width: 1440 },
  },
  updatedAt: "2026-07-20T10:01:00.000Z",
};

describe("agent-facing annotation presentation", () => {
  it("returns a compact list summary without detailed DOM or thread metadata", () => {
    const summary = summarizeAnnotation(annotation);

    expect(summary).toMatchObject({
      appId: "react-fixture",
      id: "annotation-1",
      messageCount: 2,
      pageUrl: "/work?view=cards",
      status: "in_progress",
      target: {
        selector: "main > section > article:nth-of-type(2)",
        tagName: "article",
        type: "element",
      },
    });
    expect(summary.comment.endsWith("…")).toBe(true);
    expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(annotation).length * 0.25);
  });

  it("keeps full target context but strips persistence-only message metadata", () => {
    const detail = presentAnnotation(annotation);

    expect(detail.target).toEqual(annotation.target);
    expect(detail.messages).toEqual([
      { author: "user", text: annotation.messages[0]?.text },
      { author: "agent", text: "I will tighten the hierarchy." },
    ]);
    expect(detail).not.toHaveProperty("createdAt");
    expect(detail).not.toHaveProperty("updatedAt");
  });

  it("shows claim ownership without exposing the raw agent session identifier", () => {
    const claim = {
      agentId: "agent-private-id",
      annotationId: annotation.id,
      claimedAt: "2026-07-20T10:00:00.000Z",
      expiresAt: "2026-07-20T10:30:00.000Z",
    };

    expect(presentClaim(claim, "agent-private-id")).toEqual({
      expiresAt: claim.expiresAt,
      owner: "this_session",
    });
    expect(presentClaim(claim, "other-agent")).toEqual({
      expiresAt: claim.expiresAt,
      owner: "another_session",
    });
  });
});
