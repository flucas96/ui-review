import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ReviewApi } from "./api.js";
import { ReviewEventStore } from "./event-store.js";
import { resolveStaticTarget, serveStaticTarget, type StaticTarget } from "./static-target.js";
import { UpstreamProxy } from "./upstream-proxy.js";

export type ReviewServerOptions = {
  readonly appId?: string;
  readonly host?: string;
  readonly port?: number;
  readonly projectRoot: string;
  readonly target: string;
};

export type RunningReviewServer = {
  readonly close: () => Promise<void>;
  readonly server: Server;
  readonly url: string;
};

type ResolvedTarget =
  | { readonly appId: string; readonly kind: "static"; readonly target: StaticTarget }
  | { readonly kind: "upstream"; readonly proxy: UpstreamProxy };

/** Start the local review proxy, annotation API, and event stream. */
export async function startReviewServer(options: ReviewServerOptions): Promise<RunningReviewServer> {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 4317;
  const browserBundle = await readFile(findBrowserBundle());
  const store = new ReviewEventStore(options.projectRoot);
  await store.initialize();
  const api = new ReviewApi(store, browserBundle);
  const appId = options.appId ?? defaultAppId(options.target);
  const target = await resolveTarget(options.target, appId);

  const server = createServer((request, response) => {
    void handleRequest(request, response, api, target);
  });
  if (target.kind === "upstream") {
    server.on("upgrade", (request, socket, head) => {
      target.proxy.handleUpgrade(request, socket, head);
    });
  }

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(requestedPort, host);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("UI Review server did not expose a TCP address");
  }
  const displayHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  const url = `http://${displayHost}:${address.port}`;

  return {
    close: async () => {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
        server.closeAllConnections();
      });
    },
    server,
    url,
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  api: ReviewApi,
  target: ResolvedTarget,
): Promise<void> {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://ui-review.local");
    if (await api.handle(request, response, requestUrl)) {
      return;
    }
    if (target.kind === "upstream") {
      await target.proxy.handle(request, response);
      return;
    }
    await serveStaticTarget(request, response, target.target, target.appId);
  } catch (error: unknown) {
    if (response.headersSent) {
      response.end();
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected review server error";
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(message);
  }
}

async function resolveTarget(target: string, appId: string): Promise<ResolvedTarget> {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return { kind: "upstream", proxy: new UpstreamProxy(new URL(target), appId) };
  }
  return { appId, kind: "static", target: await resolveStaticTarget(target) };
}

function defaultAppId(target: string): string {
  const normalizedTarget = target.startsWith("http://") || target.startsWith("https://")
    ? new URL(target).origin
    : resolve(target);
  return `app-${createHash("sha256").update(normalizedTarget).digest("hex").slice(0, 12)}`;
}

function findBrowserBundle(): string {
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(sourceDirectory, "browser.js"),
    resolve(sourceDirectory, "../../dist/browser.js"),
    resolve(process.cwd(), "packages/ui-review/dist/browser.js"),
  ];
  const browserBundle = candidates.find((candidate) => existsSync(candidate));
  if (browserBundle === undefined) {
    throw new Error("UI Review browser bundle is missing. Run the package build first.");
  }
  return browserBundle;
}
