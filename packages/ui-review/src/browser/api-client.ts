import type {
  Annotation,
  AnnotationStatus,
  CreateAnnotationInput,
} from "../shared/types.js";

const apiPrefix = "/__ui_review";

type AnnotationResponse = {
  readonly annotation: Annotation;
};

type AnnotationListResponse = {
  readonly annotations: readonly Annotation[];
};

/** Browser-side client for annotations, replies, statuses, and live changes. */
export class ReviewApiClient {
  readonly #appId: string;

  public constructor(appId: string) {
    this.#appId = appId;
  }

  /** List every annotation attached to an exact page URL. */
  public async list(pageUrl: string): Promise<readonly Annotation[]> {
    const query = new URLSearchParams({ appId: this.#appId, pageUrl });
    const response = await requestJson<AnnotationListResponse>(`${apiPrefix}/annotations?${query.toString()}`);
    return response.annotations;
  }

  /** Persist a new visual annotation. */
  public async create(input: CreateAnnotationInput): Promise<Annotation> {
    const response = await requestJson<AnnotationResponse>(`${apiPrefix}/annotations`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    return response.annotation;
  }

  /** Add a human reply to an annotation thread. */
  public async reply(annotationId: string, text: string): Promise<Annotation> {
    const response = await requestJson<AnnotationResponse>(
      `${apiPrefix}/annotations/${encodeURIComponent(annotationId)}/messages`,
      {
        body: JSON.stringify({ text }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    return response.annotation;
  }

  /** Change an annotation lifecycle status. */
  public async setStatus(annotationId: string, status: AnnotationStatus): Promise<Annotation> {
    const response = await requestJson<AnnotationResponse>(
      `${apiPrefix}/annotations/${encodeURIComponent(annotationId)}/status`,
      {
        body: JSON.stringify({ status }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      },
    );
    return response.annotation;
  }

  /** Delete an annotation from the current folded review state. */
  public async delete(annotationId: string): Promise<void> {
    await requestJson<undefined>(`${apiPrefix}/annotations/${encodeURIComponent(annotationId)}`, {
      method: "DELETE",
    });
  }

  /** Subscribe to changes written by either the browser or an MCP agent process. */
  public subscribe(onChange: () => void): () => void {
    const events = new EventSource(`${apiPrefix}/events`);
    events.addEventListener("change", onChange);
    return () => events.close();
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (response.status === 204) {
    return undefined as T;
  }

  const value = await response.json() as unknown;
  if (!response.ok) {
    const message = isErrorResponse(value) ? value.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return value as T;
}

function isErrorResponse(value: unknown): value is { readonly error: string } {
  return typeof value === "object"
    && value !== null
    && "error" in value
    && typeof value.error === "string";
}
