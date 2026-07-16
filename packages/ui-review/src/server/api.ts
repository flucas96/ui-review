import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { AnnotationNotFoundError, ReviewEventStore } from "./event-store.js";
import { readJsonBody, RequestBodyError, sendJson } from "./http-utils.js";
import { addMessageSchema, createAnnotationSchema, updateStatusSchema } from "./validation.js";

const apiPrefix = "/__ui_review";

/** Same-origin REST and event-stream interface used by the injected overlay. */
export class ReviewApi {
  readonly #browserBundle: Buffer;
  readonly #store: ReviewEventStore;

  public constructor(store: ReviewEventStore, browserBundle: Buffer) {
    this.#store = store;
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
      if (error instanceof AnnotationNotFoundError) {
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
      this.#streamEvents(request, response);
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

  #streamEvents(request: IncomingMessage, response: ServerResponse): void {
    response.writeHead(200, {
      connection: "keep-alive",
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no",
    });
    response.write("event: ready\ndata: {}\n\n");

    const unsubscribe = this.#store.subscribe(() => {
      if (!response.writableEnded) {
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
