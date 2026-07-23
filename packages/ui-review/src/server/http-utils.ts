import type { IncomingMessage, ServerResponse } from "node:http";

const maxBodyBytes = 1_000_000;

/** Read and parse a size-limited JSON request body. */
export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const body = await readRequestBody(request, maxBodyBytes, "Request body exceeds 1 MB");
  if (body.byteLength === 0) {
    throw new RequestBodyError("A JSON request body is required", 400);
  }

  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch (error: unknown) {
    throw new RequestBodyError("Request body is not valid JSON", 400, error);
  }
}

/** Read a request body while enforcing an explicit byte limit. */
export async function readRequestBody(
  request: IncomingMessage,
  maximumBytes: number,
  limitMessage = "Request body is too large",
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    totalBytes += buffer.byteLength;
    if (totalBytes > maximumBytes) {
      throw new RequestBodyError(limitMessage, 413);
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
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
