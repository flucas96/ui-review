import { describe, expect, it } from "vitest";
import type { Annotation, AnnotationStatus, AnnotationTarget } from "../shared/types.js";
import { formatAgentInstruction } from "./agent-instruction.js";

describe("formatAgentInstruction", () => {
  it("creates a standalone handoff with full target and thread context", () => {
    const instruction = formatAgentInstruction([
      annotation("active", "open", "Increase the heading contrast"),
    ]);

    expect(instruction).toContain("Implement only the active UI feedback listed below.");
    expect(instruction).toContain("Do not update annotation statuses or post replies");
    expect(instruction).toContain("App: dashboard");
    expect(instruction).toContain("Page: Reports");
    expect(instruction).toContain("Route: /reports");
    expect(instruction).toContain("Annotation ID: active");
    expect(instruction).toContain("> Increase the heading contrast");
    expect(instruction).toContain('"selector": "main > h1"');
  });

  it("excludes resolved annotations", () => {
    const instruction = formatAgentInstruction([
      annotation("active", "review", "Align the cards"),
      annotation("resolved", "resolved", "Remove the divider"),
    ]);

    expect(instruction).toContain("Annotation ID: active");
    expect(instruction).not.toContain("Annotation ID: resolved");
    expect(instruction).not.toContain("Remove the divider");
  });

  it("preserves multiline feedback as a Markdown quote", () => {
    const instruction = formatAgentInstruction([
      annotation("multiline", "in_progress", "Use two columns\nKeep the mobile layout"),
    ]);

    expect(instruction).toContain("> Use two columns\n> Keep the mobile layout");
  });

  it("rejects a handoff without active annotations", () => {
    expect(() => formatAgentInstruction([
      annotation("resolved", "resolved", "Already complete"),
    ])).toThrow("There are no active annotations to copy");
  });
});

function annotation(id: string, status: AnnotationStatus, comment: string): Annotation {
  return {
    appId: "dashboard",
    createdAt: "2026-07-23T08:00:00.000Z",
    id,
    messages: [{
      author: "user",
      createdAt: "2026-07-23T08:00:00.000Z",
      id: `${id}-message`,
      text: comment,
    }],
    pageTitle: "Reports",
    pageUrl: "/reports",
    status,
    target: target(),
    updatedAt: "2026-07-23T08:00:00.000Z",
  };
}

function target(): AnnotationTarget {
  return {
    accessibility: { role: "heading" },
    boundingBox: { height: 48, width: 320, x: 24, y: 40 },
    computedStyles: { color: "rgb(20, 20, 24)" },
    domPath: "html > body > main > h1",
    nearbyText: "Quarterly reports",
    selector: "main > h1",
    tagName: "h1",
    type: "element",
    viewport: { height: 900, scrollX: 0, scrollY: 0, width: 1440 },
  };
}
