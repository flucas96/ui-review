export const annotationStatuses = ["open", "in_progress", "review", "resolved"] as const;

export type AnnotationStatus = (typeof annotationStatuses)[number];

export type ReviewAuthor = "agent" | "user";

export type BoundingBox = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type Viewport = {
  readonly height: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly width: number;
};

export type ElementTarget = {
  readonly accessibility: Readonly<Record<string, string>>;
  readonly boundingBox: BoundingBox;
  readonly computedStyles: Readonly<Record<string, string>>;
  readonly domPath: string;
  readonly nearbyText: string;
  readonly selector: string;
  readonly tagName: string;
  readonly type: "element";
  readonly viewport: Viewport;
};

export type RegionTarget = {
  readonly boundingBox: BoundingBox;
  readonly shape: "rectangle";
  readonly type: "region";
  readonly viewport: Viewport;
};

export type AnnotationTarget = ElementTarget | RegionTarget;

export type ScreenshotAttachment = {
  readonly byteSize: number;
  readonly createdAt: string;
  readonly fileName: string;
  readonly height: number;
  readonly id: string;
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
  readonly width: number;
};

export type ThreadMessage = {
  readonly author: ReviewAuthor;
  readonly createdAt: string;
  readonly id: string;
  readonly text: string;
};

export type Annotation = {
  readonly appId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly messages: readonly ThreadMessage[];
  readonly pageTitle: string;
  readonly pageUrl: string;
  readonly screenshots?: readonly ScreenshotAttachment[] | undefined;
  readonly status: AnnotationStatus;
  readonly target: AnnotationTarget;
  readonly updatedAt: string;
};

export type CreateAnnotationInput = {
  readonly appId: string;
  readonly comment: string;
  readonly pageTitle: string;
  readonly pageUrl: string;
  readonly screenshots?: readonly ScreenshotAttachment[] | undefined;
  readonly target: AnnotationTarget;
};

export type UpdateAnnotationInput = {
  readonly comment?: string | undefined;
  readonly pageTitle?: string | undefined;
  readonly pageUrl?: string | undefined;
  readonly target?: AnnotationTarget | undefined;
};

export type AnnotationCreatedEvent = {
  readonly annotation: Annotation;
  readonly eventId: string;
  readonly timestamp: string;
  readonly type: "annotation.created";
};

export type MessageAddedEvent = {
  readonly annotationId: string;
  readonly appId?: string | undefined;
  readonly eventId: string;
  readonly message: ThreadMessage;
  readonly pageUrl?: string | undefined;
  readonly timestamp: string;
  readonly type: "message.added";
};

export type StatusChangedEvent = {
  readonly annotationId: string;
  readonly appId?: string | undefined;
  readonly eventId: string;
  readonly pageUrl?: string | undefined;
  readonly status: AnnotationStatus;
  readonly timestamp: string;
  readonly type: "status.changed";
};

export type AnnotationDeletedEvent = {
  readonly annotationId: string;
  readonly appId?: string | undefined;
  readonly eventId: string;
  readonly pageUrl?: string | undefined;
  readonly timestamp: string;
  readonly type: "annotation.deleted";
};

export type AnnotationUpdatedEvent = {
  readonly annotationId: string;
  readonly appId?: string | undefined;
  readonly comment?: string | undefined;
  readonly eventId: string;
  readonly pageTitle?: string | undefined;
  readonly pageUrl?: string | undefined;
  readonly target?: AnnotationTarget | undefined;
  readonly timestamp: string;
  readonly type: "annotation.updated";
};

export type ReviewEvent =
  | AnnotationCreatedEvent
  | AnnotationDeletedEvent
  | AnnotationUpdatedEvent
  | MessageAddedEvent
  | StatusChangedEvent;

/** Return whether a value is a supported annotation status. */
export function isAnnotationStatus(value: unknown): value is AnnotationStatus {
  return typeof value === "string" && annotationStatuses.some((status) => status === value);
}
