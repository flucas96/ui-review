import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import HttpProxy from "http-proxy";
import { injectReviewClient } from "./inject.js";

type FetchRequestInit = RequestInit & {
  duplex?: "half";
};

const excludedRequestHeaders = new Set(["accept-encoding", "connection", "host", "upgrade"]);
const excludedResponseHeaders = new Set(["connection", "content-length", "set-cookie", "transfer-encoding"]);

/** HTTP and WebSocket proxy that injects the review client into HTML responses. */
export class UpstreamProxy {
  readonly #appId: string;
  readonly #target: URL;
  readonly #webSocketProxy = HttpProxy.createProxyServer({ changeOrigin: true, ws: true });

  public constructor(target: URL, appId: string) {
    this.#appId = appId;
    this.#target = target;
    this.#webSocketProxy.on("error", (_error, _request, socket) => {
      if ("destroy" in socket && typeof socket.destroy === "function") {
        socket.destroy();
      }
    });
  }

  /** Forward one HTTP request and rewrite only HTML documents. */
  public async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const upstreamUrl = new URL(request.url ?? "/", this.#target);
    const headers = requestHeaders(request);
    const requestInit: FetchRequestInit = {
      headers,
      method: request.method ?? "GET",
      redirect: "manual",
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      requestInit.body = request as unknown as BodyInit;
      requestInit.duplex = "half";
    }

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(upstreamUrl, requestInit);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown upstream error";
      response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      response.end(`UI Review could not reach ${this.#target.origin}: ${message}`);
      return;
    }

    const contentType = upstreamResponse.headers.get("content-type") ?? "";
    const isHtml = contentType.toLowerCase().includes("text/html");
    copyResponseHeaders(upstreamResponse, response, this.#target, isHtml);
    response.statusCode = upstreamResponse.status;
    response.statusMessage = upstreamResponse.statusText;

    if (request.method === "HEAD" || upstreamResponse.body === null) {
      response.end();
      return;
    }

    if (isHtml) {
      const body = injectReviewClient(await upstreamResponse.text(), this.#appId);
      response.setHeader("content-length", Buffer.byteLength(body));
      response.end(body);
      return;
    }

    Readable.fromWeb(upstreamResponse.body as unknown as NodeReadableStream<Uint8Array>).pipe(response);
  }

  /** Forward a WebSocket upgrade for development HMR connections. */
  public handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.#webSocketProxy.ws(request, socket, head, { target: this.#target.href });
  }
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || excludedRequestHeaders.has(name.toLowerCase())) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else {
      headers.set(name, value);
    }
  }
  headers.set("accept-encoding", "identity");
  return headers;
}

function copyResponseHeaders(
  upstreamResponse: Response,
  response: ServerResponse,
  target: URL,
  isHtml: boolean,
): void {
  upstreamResponse.headers.forEach((value, name) => {
    if (!excludedResponseHeaders.has(name.toLowerCase())) {
      response.setHeader(name, value);
    }
  });

  const cookies = upstreamResponse.headers.getSetCookie();
  if (cookies.length > 0) {
    response.setHeader("set-cookie", cookies);
  }

  const location = upstreamResponse.headers.get("location");
  if (location?.startsWith(target.origin) === true) {
    const redirectedUrl = new URL(location);
    response.setHeader("location", `${redirectedUrl.pathname}${redirectedUrl.search}${redirectedUrl.hash}`);
  }

  if (!isHtml) {
    const contentLength = upstreamResponse.headers.get("content-length");
    if (contentLength !== null) {
      response.setHeader("content-length", contentLength);
    }
  }
}
