import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { unwatchFile, watchFile } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  Annotation,
  AnnotationStatus,
  CreateAnnotationInput,
  ReviewAuthor,
  ReviewEvent,
  ThreadMessage,
} from "../shared/types.js";
import { reviewEventSchema } from "./validation.js";
import { withFileMutex } from "./file-mutex.js";

type AnnotationQuery = {
  readonly appId?: string;
  readonly pageUrl?: string;
  readonly status?: AnnotationStatus;
};

type StoreListener = () => void;

/** Error raised when an annotation identifier no longer exists. */
export class AnnotationNotFoundError extends Error {
  public constructor(annotationId: string) {
    super(`Annotation ${annotationId} was not found`);
    this.name = "AnnotationNotFoundError";
  }
}

/** Append-only local persistence for review annotations and thread updates. */
export class ReviewEventStore {
  public readonly filePath: string;
  readonly #listeners = new Set<StoreListener>();
  readonly #lockPath: string;
  #watching = false;

  public constructor(projectRoot: string) {
    this.filePath = resolve(projectRoot, ".ui-review", "events.jsonl");
    this.#lockPath = resolve(projectRoot, ".ui-review", "events.lock");
  }

  /** Ensure the data directory and event log exist. */
  public async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, "", { encoding: "utf8" });
  }

  /** Return the current annotations after folding every persisted event. */
  public async list(query: AnnotationQuery = {}): Promise<readonly Annotation[]> {
    const annotations = [...(await this.#fold()).values()];
    return annotations
      .filter((annotation) => query.appId === undefined || annotation.appId === query.appId)
      .filter((annotation) => query.pageUrl === undefined || annotation.pageUrl === query.pageUrl)
      .filter((annotation) => query.status === undefined || annotation.status === query.status)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  /** Return one annotation or raise a typed not-found error. */
  public async get(annotationId: string): Promise<Annotation> {
    const annotation = (await this.#fold()).get(annotationId);
    if (annotation === undefined) {
      throw new AnnotationNotFoundError(annotationId);
    }
    return annotation;
  }

  /** Create an open annotation with its first human message. */
  public async create(input: CreateAnnotationInput): Promise<Annotation> {
    const timestamp = new Date().toISOString();
    const message: ThreadMessage = {
      author: "user",
      createdAt: timestamp,
      id: randomUUID(),
      text: input.comment.trim(),
    };
    const annotation: Annotation = {
      appId: input.appId,
      createdAt: timestamp,
      id: randomUUID(),
      messages: [message],
      pageTitle: input.pageTitle,
      pageUrl: input.pageUrl,
      status: "open",
      target: input.target,
      updatedAt: timestamp,
    };
    await this.#append({
      annotation,
      eventId: randomUUID(),
      timestamp,
      type: "annotation.created",
    });
    return annotation;
  }

  /** Append a human or agent reply to an existing annotation thread. */
  public async addMessage(annotationId: string, author: ReviewAuthor, text: string): Promise<Annotation> {
    await this.get(annotationId);
    const timestamp = new Date().toISOString();
    await this.#append({
      annotationId,
      eventId: randomUUID(),
      message: {
        author,
        createdAt: timestamp,
        id: randomUUID(),
        text: text.trim(),
      },
      timestamp,
      type: "message.added",
    });
    return this.get(annotationId);
  }

  /** Change the lifecycle status of an annotation. */
  public async setStatus(annotationId: string, status: AnnotationStatus): Promise<Annotation> {
    await this.get(annotationId);
    const timestamp = new Date().toISOString();
    await this.#append({
      annotationId,
      eventId: randomUUID(),
      status,
      timestamp,
      type: "status.changed",
    });
    return this.get(annotationId);
  }

  /** Remove an annotation from the folded view while retaining its history. */
  public async delete(annotationId: string): Promise<void> {
    await this.get(annotationId);
    const timestamp = new Date().toISOString();
    await this.#append({
      annotationId,
      eventId: randomUUID(),
      timestamp,
      type: "annotation.deleted",
    });
  }

  /** Subscribe to local and cross-process event-log changes. */
  public subscribe(listener: StoreListener): () => void {
    this.#listeners.add(listener);
    if (!this.#watching) {
      watchFile(this.filePath, { interval: 300 }, this.#notify);
      this.#watching = true;
    }
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0 && this.#watching) {
        unwatchFile(this.filePath, this.#notify);
        this.#watching = false;
      }
    };
  }

  readonly #notify = (): void => {
    for (const listener of this.#listeners) {
      listener();
    }
  };

  async #append(event: ReviewEvent): Promise<void> {
    await withFileMutex(this.#lockPath, async () => {
      await appendFile(this.filePath, `${JSON.stringify(event)}\n`, { encoding: "utf8" });
    });
    this.#notify();
  }

  async #fold(): Promise<Map<string, Annotation>> {
    return withFileMutex(this.#lockPath, async () => this.#foldUnlocked());
  }

  async #foldUnlocked(): Promise<Map<string, Annotation>> {
    const contents = await readFile(this.filePath, "utf8");
    const annotations = new Map<string, Annotation>();
    const lines = contents.split("\n").filter((line) => line.trim().length > 0);

    for (const [index, line] of lines.entries()) {
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch (error: unknown) {
        throw new Error(`Invalid JSON in review event log at line ${index + 1}`, { cause: error });
      }
      const event = reviewEventSchema.parse(value);

      if (event.type === "annotation.created") {
        annotations.set(event.annotation.id, event.annotation);
        continue;
      }

      if (event.type === "annotation.deleted") {
        annotations.delete(event.annotationId);
        continue;
      }

      const current = annotations.get(event.annotationId);
      if (current === undefined) {
        continue;
      }

      if (event.type === "message.added") {
        annotations.set(event.annotationId, {
          ...current,
          messages: [...current.messages, event.message],
          updatedAt: event.timestamp,
        });
        continue;
      }

      annotations.set(event.annotationId, {
        ...current,
        status: event.status,
        updatedAt: event.timestamp,
      });
    }

    return annotations;
  }
}
