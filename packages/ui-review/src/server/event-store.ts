import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { type Stats, unwatchFile, watchFile } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  Annotation,
  AnnotationStatus,
  CreateAnnotationInput,
  ReviewAuthor,
  ReviewEvent,
  ThreadMessage,
  UpdateAnnotationInput,
} from "../shared/types.js";
import { reviewEventSchema } from "./validation.js";
import { withFileMutex } from "./file-mutex.js";

type AnnotationQuery = {
  readonly appId?: string;
  readonly pageUrl?: string;
  readonly status?: AnnotationStatus;
};

type StoreListener = (event?: ReviewEvent) => void;

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
  #observedSize = 0;
  #watching = false;

  public constructor(projectRoot: string) {
    this.filePath = resolve(projectRoot, ".ui-review", "events.jsonl");
    this.#lockPath = resolve(projectRoot, ".ui-review", "events.lock");
  }

  /** Ensure the data directory and event log exist. */
  public async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, "", { encoding: "utf8" });
    this.#observedSize = (await stat(this.filePath)).size;
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
      ...(input.screenshots === undefined ? {} : { screenshots: input.screenshots }),
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
    const current = await this.get(annotationId);
    const timestamp = new Date().toISOString();
    const message: ThreadMessage = {
      author,
      createdAt: timestamp,
      id: randomUUID(),
      text: text.trim(),
    };
    await this.#append({
      annotationId,
      appId: current.appId,
      eventId: randomUUID(),
      message,
      pageUrl: current.pageUrl,
      timestamp,
      type: "message.added",
    });
    return {
      ...current,
      messages: [...current.messages, message],
      updatedAt: timestamp,
    };
  }

  /** Change the lifecycle status of an annotation. */
  public async setStatus(annotationId: string, status: AnnotationStatus): Promise<Annotation> {
    const current = await this.get(annotationId);
    const timestamp = new Date().toISOString();
    await this.#append({
      annotationId,
      appId: current.appId,
      eventId: randomUUID(),
      pageUrl: current.pageUrl,
      status,
      timestamp,
      type: "status.changed",
    });
    return { ...current, status, updatedAt: timestamp };
  }

  /** Edit the initial comment or re-anchor an annotation to a new target. */
  public async update(annotationId: string, input: UpdateAnnotationInput): Promise<Annotation> {
    const current = await this.get(annotationId);
    const timestamp = new Date().toISOString();
    const pageUrl = input.pageUrl ?? current.pageUrl;
    await this.#append({
      annotationId,
      appId: current.appId,
      ...(input.comment === undefined ? {} : { comment: input.comment.trim() }),
      eventId: randomUUID(),
      ...(input.pageTitle === undefined ? {} : { pageTitle: input.pageTitle }),
      pageUrl,
      ...(input.target === undefined ? {} : { target: input.target }),
      timestamp,
      type: "annotation.updated",
    });
    return applyAnnotationUpdate(current, input, timestamp);
  }

  /** Remove an annotation from the folded view while retaining its history. */
  public async delete(annotationId: string): Promise<void> {
    const current = await this.get(annotationId);
    const timestamp = new Date().toISOString();
    await this.#append({
      annotationId,
      appId: current.appId,
      eventId: randomUUID(),
      pageUrl: current.pageUrl,
      timestamp,
      type: "annotation.deleted",
    });
  }

  /** Subscribe to local and cross-process event-log changes. */
  public subscribe(listener: StoreListener): () => void {
    this.#listeners.add(listener);
    if (!this.#watching) {
      watchFile(this.filePath, { interval: 300 }, this.#handleFileChange);
      this.#watching = true;
    }
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0 && this.#watching) {
        unwatchFile(this.filePath, this.#handleFileChange);
        this.#watching = false;
      }
    };
  }

  readonly #handleFileChange = (current: Stats): void => {
    if (current.size === this.#observedSize) {
      return;
    }
    this.#observedSize = current.size;
    this.#notify();
  };

  readonly #notify = (event?: ReviewEvent): void => {
    for (const listener of this.#listeners) {
      listener(event);
    }
  };

  async #append(event: ReviewEvent): Promise<void> {
    await withFileMutex(this.#lockPath, async () => {
      await appendFile(this.filePath, `${JSON.stringify(event)}\n`, { encoding: "utf8" });
      this.#observedSize = (await stat(this.filePath)).size;
    });
    this.#notify(event);
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

      if (event.type === "annotation.updated") {
        annotations.set(event.annotationId, applyAnnotationUpdate(current, event, event.timestamp));
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

function applyAnnotationUpdate(
  annotation: Annotation,
  input: UpdateAnnotationInput,
  timestamp: string,
): Annotation {
  const firstMessage = annotation.messages[0];
  const messages = input.comment === undefined || firstMessage === undefined
    ? annotation.messages
    : [
        { ...firstMessage, text: input.comment.trim() },
        ...annotation.messages.slice(1),
      ];
  return {
    ...annotation,
    messages,
    pageTitle: input.pageTitle ?? annotation.pageTitle,
    pageUrl: input.pageUrl ?? annotation.pageUrl,
    target: input.target ?? annotation.target,
    updatedAt: timestamp,
  };
}
