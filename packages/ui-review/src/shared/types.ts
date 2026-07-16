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
  readonly status: AnnotationStatus;
  readonly target: AnnotationTarget;
  readonly updatedAt: string;
};

export type CreateAnnotationInput = {
  readonly appId: string;
  readonly comment: string;
  readonly pageTitle: string;
  readonly pageUrl: string;
  readonly target: AnnotationTarget;
};

export type AnnotationCreatedEvent = {
  readonly annotation: Annotation;
  readonly eventId: string;
  readonly timestamp: string;
  readonly type: "annotation.created";
};

export type MessageAddedEvent = {
  readonly annotationId: string;
  readonly eventId: string;
  readonly message: ThreadMessage;
  readonly timestamp: string;
  readonly type: "message.added";
};

export type StatusChangedEvent = {
  readonly annotationId: string;
  readonly eventId: string;
  readonly status: AnnotationStatus;
  readonly timestamp: string;
  readonly type: "status.changed";
};

export type AnnotationDeletedEvent = {
  readonly annotationId: string;
  readonly eventId: string;
  readonly timestamp: string;
  readonly type: "annotation.deleted";
};

export type ReviewEvent =
  | AnnotationCreatedEvent
  | AnnotationDeletedEvent
  | MessageAddedEvent
  | StatusChangedEvent;

/** Return whether a value is a supported annotation status. */
export function isAnnotationStatus(value: unknown): value is AnnotationStatus {
  return typeof value === "string" && annotationStatuses.some((status) => status === value);
}
