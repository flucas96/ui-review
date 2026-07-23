import type { Annotation, ThreadMessage } from "../shared/types.js";

const instructionHeading = "# UI Review feedback";

/** Format active annotations as a standalone instruction for a coding agent. */
export function formatAgentInstruction(annotations: readonly Annotation[]): string {
  const activeAnnotations = annotations.filter((annotation) => annotation.status !== "resolved");
  const firstAnnotation = activeAnnotations[0];
  if (firstAnnotation === undefined) {
    throw new Error("There are no active annotations to copy");
  }

  const header = [
    instructionHeading,
    "",
    "Implement only the active UI feedback listed below. Do not make unrelated changes.",
    "Do not update annotation statuses or post replies; this is a standalone handoff.",
    "Preserve existing behavior outside the requested changes and verify the affected UI.",
    "",
    `App: ${firstAnnotation.appId}`,
    `Page: ${firstAnnotation.pageTitle}`,
    `Route: ${firstAnnotation.pageUrl}`,
  ];
  const feedback = activeAnnotations.flatMap((annotation, index) => [
    "",
    `## Feedback ${String(index + 1)}`,
    "",
    `Annotation ID: ${annotation.id}`,
    `Status: ${annotation.status}`,
    "",
    "### Thread",
    "",
    ...annotation.messages.flatMap(formatMessage),
    ...formatScreenshots(annotation),
    "### Target context",
    "",
    "```json",
    JSON.stringify(annotation.target, null, 2),
    "```",
  ]);

  return [...header, ...feedback, ""].join("\n");
}

function formatScreenshots(annotation: Annotation): readonly string[] {
  const screenshots = annotation.screenshots ?? [];
  if (screenshots.length === 0) {
    return [];
  }
  return [
    "### Screenshots",
    "",
    ...screenshots.map((screenshot) => (
      `- ${screenshot.fileName}: .ui-review/attachments/${screenshot.id} (${String(screenshot.width)}×${String(screenshot.height)})`
    )),
    "",
  ];
}

function formatMessage(message: ThreadMessage): readonly string[] {
  const author = message.author === "user" ? "Reviewer" : "Agent";
  const quotedText = message.text.split("\n").map((line) => `> ${line}`);
  return [`${author}:`, "", ...quotedText, ""];
}
