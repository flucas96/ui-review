import type { IncomingMessage, ServerResponse } from "node:http";

const maxBodyBytes = 1_000_000;

/** Read and parse a size-limited JSON request body. */
export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBodyBytes) {
      throw new RequestBodyError("Request body exceeds 1 MB", 413);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    throw new RequestBodyError("A JSON request body is required", 400);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error: unknown) {
    throw new RequestBodyError("Request body is not valid JSON", 400, error);
  }
}

/** Send a JSON response with safe development-tool defaults. */
export function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

/** Typed request parsing error with an HTTP response status. */
export class RequestBodyError extends Error {
  public readonly statusCode: number;

  public constructor(message: string, statusCode: number, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RequestBodyError";
    this.statusCode = statusCode;
  }
}
