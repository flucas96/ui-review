import { z } from "zod";
import type {
  Annotation,
  AnnotationStatus,
  CreateAnnotationInput,
  ReviewEvent,
  ScreenshotAttachment,
  UpdateAnnotationInput,
} from "../shared/types.js";

const finiteNumber = z.number().finite();

const boundingBoxSchema = z.object({
  height: finiteNumber.nonnegative(),
  width: finiteNumber.nonnegative(),
  x: finiteNumber,
  y: finiteNumber,
});

const viewportSchema = z.object({
  height: finiteNumber.positive(),
  scrollX: finiteNumber,
  scrollY: finiteNumber,
  width: finiteNumber.positive(),
});

const elementTargetSchema = z.object({
  accessibility: z.record(z.string(), z.string()),
  boundingBox: boundingBoxSchema,
  computedStyles: z.record(z.string(), z.string()),
  domPath: z.string().min(1).max(4_000),
  nearbyText: z.string().max(2_000),
  selector: z.string().min(1).max(2_000),
  tagName: z.string().min(1).max(100),
  type: z.literal("element"),
  viewport: viewportSchema,
});

const regionTargetSchema = z.object({
  boundingBox: boundingBoxSchema,
  shape: z.literal("rectangle"),
  type: z.literal("region"),
  viewport: viewportSchema,
});

const annotationTargetSchema = z.discriminatedUnion("type", [elementTargetSchema, regionTargetSchema]);

export const screenshotAttachmentSchema: z.ZodType<ScreenshotAttachment> = z.object({
  byteSize: z.number().int().positive().max(8_000_000),
  createdAt: z.iso.datetime(),
  fileName: z.string().min(1).max(255),
  height: z.number().int().positive().max(100_000),
  id: z.string().regex(/^[0-9a-f-]{36}\.(?:jpe?g|png|webp)$/),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  width: z.number().int().positive().max(100_000),
});

const threadMessageSchema = z.object({
  author: z.enum(["agent", "user"]),
  createdAt: z.iso.datetime(),
  id: z.string().min(1),
  text: z.string().min(1).max(20_000),
});

const annotationSchema = z.object({
  appId: z.string().min(1).max(200),
  createdAt: z.iso.datetime(),
  id: z.string().min(1),
  messages: z.array(threadMessageSchema),
  pageTitle: z.string().max(1_000),
  pageUrl: z.string().min(1).max(4_000),
  screenshots: z.array(screenshotAttachmentSchema).max(5).optional(),
  status: z.enum(["open", "in_progress", "review", "resolved"]),
  target: annotationTargetSchema,
  updatedAt: z.iso.datetime(),
});

export const createAnnotationSchema: z.ZodType<CreateAnnotationInput> = z.object({
  appId: z.string().min(1).max(200),
  comment: z.string().trim().min(1).max(20_000),
  pageTitle: z.string().max(1_000),
  pageUrl: z.string().min(1).max(4_000),
  screenshots: z.array(screenshotAttachmentSchema).max(5).optional(),
  target: annotationTargetSchema,
});

export const updateAnnotationSchema: z.ZodType<UpdateAnnotationInput> = z.object({
  comment: z.string().trim().min(1).max(20_000).optional(),
  pageTitle: z.string().max(1_000).optional(),
  pageUrl: z.string().min(1).max(4_000).optional(),
  target: annotationTargetSchema.optional(),
}).refine(
  (input) => input.comment !== undefined || input.target !== undefined,
  { message: "An updated comment or target is required" },
);

export const addMessageSchema = z.object({
  author: z.enum(["agent", "user"]).default("user"),
  text: z.string().trim().min(1).max(20_000),
});

export const updateStatusSchema: z.ZodType<{ readonly status: AnnotationStatus }> = z.object({
  status: z.enum(["open", "in_progress", "review", "resolved"]),
});

export const reviewEventSchema: z.ZodType<ReviewEvent> = z.discriminatedUnion("type", [
  z.object({
    annotation: annotationSchema,
    eventId: z.string().min(1),
    timestamp: z.iso.datetime(),
    type: z.literal("annotation.created"),
  }),
  z.object({
    annotationId: z.string().min(1),
    appId: z.string().min(1).max(200).optional(),
    eventId: z.string().min(1),
    pageUrl: z.string().min(1).max(4_000).optional(),
    timestamp: z.iso.datetime(),
    type: z.literal("annotation.deleted"),
  }),
  z.object({
    annotationId: z.string().min(1),
    appId: z.string().min(1).max(200).optional(),
    comment: z.string().trim().min(1).max(20_000).optional(),
    eventId: z.string().min(1),
    pageTitle: z.string().max(1_000).optional(),
    pageUrl: z.string().min(1).max(4_000).optional(),
    target: annotationTargetSchema.optional(),
    timestamp: z.iso.datetime(),
    type: z.literal("annotation.updated"),
  }).refine(
    (event) => event.comment !== undefined || event.target !== undefined,
    { message: "An updated comment or target is required" },
  ),
  z.object({
    annotationId: z.string().min(1),
    appId: z.string().min(1).max(200).optional(),
    eventId: z.string().min(1),
    message: threadMessageSchema,
    pageUrl: z.string().min(1).max(4_000).optional(),
    timestamp: z.iso.datetime(),
    type: z.literal("message.added"),
  }),
  z.object({
    annotationId: z.string().min(1),
    appId: z.string().min(1).max(200).optional(),
    eventId: z.string().min(1),
    pageUrl: z.string().min(1).max(4_000).optional(),
    status: z.enum(["open", "in_progress", "review", "resolved"]),
    timestamp: z.iso.datetime(),
    type: z.literal("status.changed"),
  }),
]);

/** Parse and validate an annotation read from external input. */
export function parseAnnotation(value: unknown): Annotation {
  return annotationSchema.parse(value);
}
