import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { injectReviewClient } from "./inject.js";

export type StaticTarget = {
  readonly entryFile: string;
  readonly rootDirectory: string;
};

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Resolve a file or directory argument into a static review target. */
export async function resolveStaticTarget(targetPath: string): Promise<StaticTarget> {
  const absoluteTarget = resolve(targetPath);
  const targetStats = await stat(absoluteTarget);

  if (targetStats.isDirectory()) {
    const entryFile = resolve(absoluteTarget, "index.html");
    const entryStats = await stat(entryFile);
    if (!entryStats.isFile()) {
      throw new Error(`Static target does not contain an index.html file: ${absoluteTarget}`);
    }
    return { entryFile, rootDirectory: absoluteTarget };
  }

  if (!targetStats.isFile()) {
    throw new Error(`Static target is not a file or directory: ${absoluteTarget}`);
  }

  return { entryFile: absoluteTarget, rootDirectory: dirname(absoluteTarget) };
}

/** Serve a local static target with HTML injection and an SPA fallback. */
export async function serveStaticTarget(
  request: IncomingMessage,
  response: ServerResponse,
  target: StaticTarget,
  appId: string,
  includeHash: boolean,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  const requestUrl = new URL(request.url ?? "/", "http://ui-review.local");
  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const requestedFile = decodedPath === "/"
    ? target.entryFile
    : resolve(target.rootDirectory, `.${decodedPath}`);
  const safeFile = isWithin(target.rootDirectory, requestedFile) ? requestedFile : target.entryFile;
  const resolvedFile = await existingFile(safeFile)
    ?? (acceptsHtml(request) ? target.entryFile : undefined);

  if (resolvedFile === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const extension = extname(resolvedFile).toLowerCase();
  const contentType = contentTypes[extension] ?? "application/octet-stream";
  const rawBody = await readFile(resolvedFile);
  const body = extension === ".html"
    ? Buffer.from(injectReviewClient(rawBody.toString("utf8"), { appId, includeHash }), "utf8")
    : rawBody;

  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-length": body.byteLength,
    "content-type": contentType,
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

function acceptsHtml(request: IncomingMessage): boolean {
  return request.headers.accept?.includes("text/html") ?? false;
}

async function existingFile(filePath: string): Promise<string | undefined> {
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile() ? filePath : undefined;
  } catch (error: unknown) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isWithin(rootDirectory: string, candidate: string): boolean {
  const pathFromRoot = relative(rootDirectory, candidate);
  return pathFromRoot.length === 0 || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}
