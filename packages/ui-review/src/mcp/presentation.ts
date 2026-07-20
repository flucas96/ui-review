import type { Annotation, AnnotationTarget, ThreadMessage } from "../shared/types.js";

const summaryTextLimit = 320;
const summarySelectorLimit = 300;

type AgentMessage = Pick<ThreadMessage, "author" | "text">;

type AnnotationSummaryTarget =
  | {
      readonly selector: string;
      readonly tagName: string;
      readonly type: "element";
    }
  | {
      readonly boundingBox: AnnotationTarget["boundingBox"];
      readonly type: "region";
    };

export type AnnotationSummary = {
  readonly appId: string;
  readonly comment: string;
  readonly id: string;
  readonly messageCount: number;
  readonly pageUrl: string;
  readonly status: Annotation["status"];
  readonly target: AnnotationSummaryTarget;
};

export type AgentAnnotation = Pick<
  Annotation,
  "appId" | "id" | "pageTitle" | "pageUrl" | "status" | "target"
> & {
  readonly messages: readonly AgentMessage[];
};

/** Project an annotation into the compact overview used for agent discovery. */
export function summarizeAnnotation(annotation: Annotation): AnnotationSummary {
  const firstMessage = annotation.messages[0];
  return {
    appId: annotation.appId,
    comment: truncate(firstMessage?.text ?? "", summaryTextLimit),
    id: annotation.id,
    messageCount: annotation.messages.length,
    pageUrl: annotation.pageUrl,
    status: annotation.status,
    target: summarizeTarget(annotation.target),
  };
}

/** Remove persistence-only identifiers and timestamps from one agent-facing annotation. */
export function presentAnnotation(annotation: Annotation): AgentAnnotation {
  return {
    appId: annotation.appId,
    id: annotation.id,
    messages: annotation.messages.map(({ author, text }) => ({ author, text })),
    pageTitle: annotation.pageTitle,
    pageUrl: annotation.pageUrl,
    status: annotation.status,
    target: annotation.target,
  };
}

function summarizeTarget(target: AnnotationTarget): AnnotationSummaryTarget {
  if (target.type === "region") {
    return {
      boundingBox: target.boundingBox,
      type: target.type,
    };
  }
  return {
    selector: truncate(target.selector, summarySelectorLimit),
    tagName: target.tagName,
    type: target.type,
  };
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}
