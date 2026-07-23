import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import type { ReviewEvent } from "../shared/types.js";
import { AttachmentNotFoundError, ScreenshotAttachmentStore } from "./attachment-store.js";
import { AnnotationNotFoundError, ReviewEventStore } from "./event-store.js";
import { readJsonBody, readRequestBody, RequestBodyError, sendJson } from "./http-utils.js";
import {
  addMessageSchema,
  createAnnotationSchema,
  updateAnnotationSchema,
  updateStatusSchema,
} from "./validation.js";

const apiPrefix = "/__ui_review";
const maxScreenshotBytes = 8_000_000;

/** Same-origin REST and event-stream interface used by the injected overlay. */
export class ReviewApi {
  readonly #attachments: ScreenshotAttachmentStore;
  readonly #browserBundle: Buffer;
  readonly #store: ReviewEventStore;

  public constructor(
    store: ReviewEventStore,
    attachments: ScreenshotAttachmentStore,
    browserBundle: Buffer,
  ) {
    this.#store = store;
    this.#attachments = attachments;
    this.#browserBundle = browserBundle;
  }

  /** Handle a reserved UI Review request and report whether it was consumed. */
  public async handle(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith(apiPrefix)) {
      return false;
    }

    try {
      await this.#route(request, response, url);
    } catch (error: unknown) {
      if (response.headersSent) {
        response.end();
        return true;
      }
      if (error instanceof AnnotationNotFoundError || error instanceof AttachmentNotFoundError) {
        sendJson(response, 404, { error: error.message });
        return true;
      }
      if (error instanceof RequestBodyError) {
        sendJson(response, error.statusCode, { error: error.message });
        return true;
      }
      if (error instanceof ZodError) {
        sendJson(response, 400, {
          error: "Request validation failed",
          issues: error.issues.map((issue) => ({ message: issue.message, path: issue.path.join(".") })),
        });
        return true;
      }

      const message = error instanceof Error ? error.message : "Unexpected UI Review error";
      sendJson(response, 500, { error: message });
    }
    return true;
  }

  async #route(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (request.method === "GET" && url.pathname === `${apiPrefix}/health`) {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && url.pathname === `${apiPrefix}/browser.js`) {
      response.writeHead(200, {
        "cache-control": "no-cache",
        "content-length": this.#browserBundle.byteLength,
        "content-type": "text/javascript; charset=utf-8",
        "x-content-type-options": "nosniff",
      });
      response.end(this.#browserBundle);
      return;
    }

    if (request.method === "GET" && url.pathname === `${apiPrefix}/events`) {
      this.#streamEvents(request, response, url);
      return;
    }

    if (request.method === "POST" && url.pathname === `${apiPrefix}/screenshots`) {
      const body = await readRequestBody(
        request,
        maxScreenshotBytes,
        "Screenshot exceeds 8 MB",
      );
      if (body.byteLength === 0) {
        throw new RequestBodyError("A screenshot body is required", 400);
      }
      const mimeType = headerValue(request, "content-type").split(";", 1)[0]?.trim() ?? "";
      const fileName = decodeHeaderValue(headerValue(request, "x-ui-review-file-name")) || "screenshot";
      const width = positiveIntegerHeader(request, "x-ui-review-width");
      const height = positiveIntegerHeader(request, "x-ui-review-height");
      try {
        const screenshot = await this.#attachments.save({ body, fileName, height, mimeType, width });
        sendJson(response, 201, { screenshot });
      } catch (error: unknown) {
        if (error instanceof TypeError) {
          throw new RequestBodyError(error.message, 400, error);
        }
        throw error;
      }
      return;
    }

    const screenshotRoute = url.pathname.match(/^\/__ui_review\/screenshots\/([^/]+)$/);
    if (request.method === "GET" && screenshotRoute !== null) {
      const attachmentId = decodeURIComponent(screenshotRoute[1] ?? "");
      const screenshot = await this.#attachments.read(attachmentId);
      response.writeHead(200, {
        "cache-control": "private, max-age=31536000, immutable",
        "content-length": screenshot.body.byteLength,
        "content-type": screenshot.mimeType,
        "x-content-type-options": "nosniff",
      });
      response.end(screenshot.body);
      return;
    }

    if (url.pathname === `${apiPrefix}/annotations`) {
      if (request.method === "GET") {
        const appId = url.searchParams.get("appId") ?? undefined;
        const pageUrl = url.searchParams.get("pageUrl") ?? undefined;
        const annotations = await this.#store.list({
          ...(appId === undefined ? {} : { appId }),
          ...(pageUrl === undefined ? {} : { pageUrl }),
        });
        sendJson(response, 200, { annotations });
        return;
      }
      if (request.method === "POST") {
        const input = createAnnotationSchema.parse(await readJsonBody(request));
        await Promise.all((input.screenshots ?? []).map(async (screenshot) => {
          await this.#attachments.assertExists(screenshot.id);
        }));
        sendJson(response, 201, { annotation: await this.#store.create(input) });
        return;
      }
    }

    const annotationRoute = url.pathname.match(/^\/__ui_review\/annotations\/([^/]+)$/);
    if (annotationRoute !== null) {
      const annotationId = decodeURIComponent(annotationRoute[1] ?? "");
      if (request.method === "GET") {
        sendJson(response, 200, { annotation: await this.#store.get(annotationId) });
        return;
      }
      if (request.method === "PATCH") {
        const input = updateAnnotationSchema.parse(await readJsonBody(request));
        sendJson(response, 200, { annotation: await this.#store.update(annotationId, input) });
        return;
      }
      if (request.method === "DELETE") {
        await this.#store.delete(annotationId);
        response.writeHead(204, { "cache-control": "no-store" });
        response.end();
        return;
      }
    }

    const messageRoute = url.pathname.match(/^\/__ui_review\/annotations\/([^/]+)\/messages$/);
    if (request.method === "POST" && messageRoute !== null) {
      const annotationId = decodeURIComponent(messageRoute[1] ?? "");
      const input = addMessageSchema.parse(await readJsonBody(request));
      const annotation = await this.#store.addMessage(annotationId, "user", input.text);
      sendJson(response, 201, { annotation });
      return;
    }

    const statusRoute = url.pathname.match(/^\/__ui_review\/annotations\/([^/]+)\/status$/);
    if (request.method === "PATCH" && statusRoute !== null) {
      const annotationId = decodeURIComponent(statusRoute[1] ?? "");
      const input = updateStatusSchema.parse(await readJsonBody(request));
      const annotation = await this.#store.setStatus(annotationId, input.status);
      sendJson(response, 200, { annotation });
      return;
    }

    sendJson(response, 404, { error: "UI Review endpoint not found" });
  }

  #streamEvents(request: IncomingMessage, response: ServerResponse, url: URL): void {
    const appId = url.searchParams.get("appId") ?? undefined;
    const pageUrl = url.searchParams.get("pageUrl") ?? undefined;
    response.writeHead(200, {
      connection: "keep-alive",
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no",
    });
    response.write("event: ready\ndata: {}\n\n");

    const unsubscribe = this.#store.subscribe((event) => {
      if (!response.writableEnded && matchesEvent(event, appId, pageUrl)) {
        response.write(`event: change\ndata: {"timestamp":"${new Date().toISOString()}"}\n\n`);
      }
    });
    const keepAlive = setInterval(() => {
      if (!response.writableEnded) {
        response.write(": keep-alive\n\n");
      }
    }, 20_000);

    request.once("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
      response.end();
    });
  }
}

function matchesEvent(
  event: ReviewEvent | undefined,
  appId: string | undefined,
  pageUrl: string | undefined,
): boolean {
  if (event === undefined) {
    return true;
  }
  const eventAppId = event.type === "annotation.created" ? event.annotation.appId : event.appId;
  const eventPageUrl = event.type === "annotation.created" ? event.annotation.pageUrl : event.pageUrl;
  return (appId === undefined || eventAppId === undefined || eventAppId === appId)
    && (pageUrl === undefined || eventPageUrl === undefined || eventPageUrl === pageUrl);
}

function headerValue(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function decodeHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function positiveIntegerHeader(request: IncomingMessage, name: string): number {
  const value = Number(headerValue(request, name));
  if (!Number.isInteger(value) || value <= 0 || value > 100_000) {
    throw new RequestBodyError(`${name} must be a positive integer`, 400);
  }
  return value;
}
