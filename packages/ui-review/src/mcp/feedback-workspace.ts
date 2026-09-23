import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { Annotation, AnnotationStatus } from "../shared/types.js";
import { AnnotationNotFoundError, ReviewEventStore } from "../server/event-store.js";
import { readFeedbackRoots } from "../server/feedback-roots.js";
import { AnnotationClaimStore } from "./annotation-claims.js";

type AnnotationQuery = {
  readonly appId?: string;
  readonly pageUrl?: string;
  readonly status?: AnnotationStatus;
};

/** Event log and claim store of one `.ui-review` feedback root. */
export type FeedbackRoot = {
  readonly claims: AnnotationClaimStore;
  readonly path: string;
  readonly store: ReviewEventStore;
};

/** One annotation together with the feedback root that persists it. */
export type LocatedAnnotation = {
  readonly annotation: Annotation;
  readonly root: FeedbackRoot;
};

/** Every feedback root visible to one MCP process: its own root plus all registered review roots. */
export class FeedbackWorkspace {
  readonly #primary: FeedbackRoot;
  readonly #registryPath: string;
  readonly #roots = new Map<string, FeedbackRoot>();

  public constructor(projectRoot: string, registryPath: string) {
    this.#primary = this.#root(projectRoot);
    this.#registryPath = registryPath;
  }

  /** Ensure the primary root's data directories exist. */
  public async initialize(): Promise<void> {
    await Promise.all([this.#primary.store.initialize(), this.#primary.claims.initialize()]);
  }

  /** List annotations across every root that has an event log, oldest first. */
  public async list(query: AnnotationQuery = {}): Promise<readonly LocatedAnnotation[]> {
    const perRoot = await Promise.all((await this.#activeRoots()).map(async (root) =>
      (await root.store.list(query)).map((annotation) => ({ annotation, root }))));
    return perRoot.flat().sort((left, right) => left.annotation.createdAt.localeCompare(right.annotation.createdAt));
  }

  /** Find the root that owns an annotation or raise a typed not-found error. */
  public async locate(annotationId: string): Promise<LocatedAnnotation> {
    for (const root of await this.#activeRoots()) {
      try {
        return { annotation: await root.store.get(annotationId), root };
      } catch (error: unknown) {
        if (!(error instanceof AnnotationNotFoundError)) {
          throw error;
        }
      }
    }
    throw new AnnotationNotFoundError(annotationId);
  }

  /** Resolve the claim store for an annotation, falling back to the primary root once it is gone. */
  public async claimsFor(annotationId: string): Promise<AnnotationClaimStore> {
    try {
      return (await this.locate(annotationId)).root.claims;
    } catch (error: unknown) {
      if (error instanceof AnnotationNotFoundError) {
        return this.#primary.claims;
      }
      throw error;
    }
  }

  async #activeRoots(): Promise<readonly FeedbackRoot[]> {
    const registered = (await readFeedbackRoots(this.#registryPath))
      .map((path) => this.#root(path))
      .filter((root) => root !== this.#primary);
    const present = await Promise.all(registered.map(async (root) => exists(root.store.filePath)));
    return [this.#primary, ...registered.filter((_, index) => present[index])];
  }

  #root(path: string): FeedbackRoot {
    const absolute = resolve(path);
    let root = this.#roots.get(absolute);
    if (root === undefined) {
      root = { claims: new AnnotationClaimStore(absolute), path: absolute, store: new ReviewEventStore(absolute) };
      this.#roots.set(absolute, root);
    }
    return root;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
