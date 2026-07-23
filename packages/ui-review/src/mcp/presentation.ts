import type {
  Annotation,
  AnnotationTarget,
  ScreenshotAttachment,
  ThreadMessage,
} from "../shared/types.js";
import type { AnnotationClaim } from "./annotation-claims.js";

const summaryTextLimit = 320;
const summarySelectorLimit = 300;

type AgentMessage = Pick<ThreadMessage, "author" | "text">;

export type AgentClaim = {
  readonly expiresAt: string;
  readonly owner: "another_session" | "this_session";
};

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
  readonly screenshotCount: number;
  readonly status: Annotation["status"];
  readonly target: AnnotationSummaryTarget;
  readonly claim?: AgentClaim;
};

export type AgentAnnotation = Pick<
  Annotation,
  "appId" | "id" | "pageTitle" | "pageUrl" | "status" | "target"
> & {
  readonly claim?: AgentClaim;
  readonly messages: readonly AgentMessage[];
  readonly screenshots: readonly AgentScreenshot[];
};

type AgentScreenshot = Pick<
  ScreenshotAttachment,
  "byteSize" | "fileName" | "height" | "mimeType" | "width"
> & {
  readonly relativePath: string;
};

/** Project an annotation into the compact overview used for agent discovery. */
export function summarizeAnnotation(
  annotation: Annotation,
  claim?: AgentClaim,
): AnnotationSummary {
  const firstMessage = annotation.messages[0];
  return {
    appId: annotation.appId,
    comment: truncate(firstMessage?.text ?? "", summaryTextLimit),
    id: annotation.id,
    messageCount: annotation.messages.length,
    pageUrl: annotation.pageUrl,
    screenshotCount: annotation.screenshots?.length ?? 0,
    status: annotation.status,
    target: summarizeTarget(annotation.target),
    ...(claim === undefined ? {} : { claim }),
  };
}

/** Remove persistence-only identifiers and timestamps from one agent-facing annotation. */
export function presentAnnotation(annotation: Annotation, claim?: AgentClaim): AgentAnnotation {
  return {
    appId: annotation.appId,
    id: annotation.id,
    messages: annotation.messages.map(({ author, text }) => ({ author, text })),
    pageTitle: annotation.pageTitle,
    pageUrl: annotation.pageUrl,
    screenshots: (annotation.screenshots ?? []).map(presentScreenshot),
    status: annotation.status,
    target: annotation.target,
    ...(claim === undefined ? {} : { claim }),
  };
}

function presentScreenshot(screenshot: ScreenshotAttachment): AgentScreenshot {
  return {
    byteSize: screenshot.byteSize,
    fileName: screenshot.fileName,
    height: screenshot.height,
    mimeType: screenshot.mimeType,
    relativePath: `.ui-review/attachments/${screenshot.id}`,
    width: screenshot.width,
  };
}

/** Hide raw session identifiers while showing whether the current agent owns a lease. */
export function presentClaim(claim: AnnotationClaim | undefined, agentId: string): AgentClaim | undefined {
  return claim === undefined
    ? undefined
    : {
        expiresAt: claim.expiresAt,
        owner: claim.agentId === agentId ? "this_session" : "another_session",
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
