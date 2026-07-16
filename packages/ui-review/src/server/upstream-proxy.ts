import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
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
  readonly #includeHash: boolean;
  readonly #target: URL;
  readonly #webSocketProxy = HttpProxy.createProxyServer({ changeOrigin: true, ws: true });

  public constructor(target: URL, appId: string, includeHash: boolean) {
    this.#appId = appId;
    this.#includeHash = includeHash;
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
    const nonce = isHtml ? randomBytes(18).toString("base64") : undefined;
    copyResponseHeaders(upstreamResponse, response, this.#target, isHtml, nonce);
    response.statusCode = upstreamResponse.status;
    response.statusMessage = upstreamResponse.statusText;

    if (request.method === "HEAD" || upstreamResponse.body === null) {
      response.end();
      return;
    }

    if (isHtml) {
      const body = injectReviewClient(await upstreamResponse.text(), {
        appId: this.#appId,
        includeHash: this.#includeHash,
        ...(nonce === undefined ? {} : { nonce }),
      });
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
  nonce: string | undefined,
): void {
  upstreamResponse.headers.forEach((value, name) => {
    const normalizedName = name.toLowerCase();
    if (!excludedResponseHeaders.has(normalizedName) && !(nonce !== undefined && isCspHeader(normalizedName))) {
      response.setHeader(name, value);
    }
  });

  if (nonce !== undefined) {
    for (const headerName of ["content-security-policy", "content-security-policy-report-only"] as const) {
      const policy = upstreamResponse.headers.get(headerName);
      if (policy !== null) {
        response.setHeader(headerName, addReviewNonce(policy, nonce));
      }
    }
  }

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

function isCspHeader(name: string): boolean {
  return name === "content-security-policy" || name === "content-security-policy-report-only";
}

/** Add the injected review script and style nonce to an HTTP CSP policy. */
export function addReviewNonce(policy: string, nonce: string): string {
  const nonceSource = `'nonce-${nonce}'`;
  const directives = policy.split(";").map((directive) => directive.trim()).filter((directive) => directive.length > 0);
  const nonceDirectives = new Set(["script-src", "script-src-elem", "style-src", "style-src-elem"]);
  let foundConnectDirective = false;
  let foundScriptDirective = false;
  let foundStyleDirective = false;
  const augmented = directives.map((directive) => {
    const [name] = directive.split(/\s+/, 1);
    const normalizedName = name?.toLowerCase();
    if (normalizedName === "connect-src") {
      foundConnectDirective = true;
      return directive.includes("'self'") ? directive : `${directive} 'self'`;
    }
    if (normalizedName === undefined || !nonceDirectives.has(normalizedName)) {
      return directive;
    }
    if (normalizedName.startsWith("script-")) {
      foundScriptDirective = true;
    } else {
      foundStyleDirective = true;
    }
    return directive.includes(nonceSource) ? directive : `${directive} ${nonceSource}`;
  });
  if (!foundScriptDirective) {
    augmented.push(`script-src 'self' ${nonceSource}`);
  }
  if (!foundStyleDirective) {
    augmented.push(`style-src 'self' ${nonceSource}`);
  }
  if (!foundConnectDirective) {
    augmented.push("connect-src 'self'");
  }
  return augmented.join("; ");
}
