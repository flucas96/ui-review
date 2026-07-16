import {
  isAnnotationStatus,
  type Annotation,
  type AnnotationStatus,
  type AnnotationTarget,
  type RegionTarget,
} from "../shared/types.js";
import { ReviewApiClient } from "./api-client.js";
import { captureElementTarget, captureViewport, currentPageUrl } from "./targeting.js";
import { overlayStyles } from "./styles.js";

type SelectionMode = "element" | "region" | null;

type Point = {
  readonly x: number;
  readonly y: number;
};

const icons = {
  arrowLeft: svg("M15 18l-6-6 6-6M9 12h10"),
  arrowUp: svg("M12 19V5m0 0L6 11m6-6 6 6"),
  close: svg("M6 6l12 12M18 6L6 18"),
  comments: svg("M20 15a4 4 0 01-4 4H8l-4 3V7a4 4 0 014-4h8a4 4 0 014 4v8z"),
  cursor: svg("M5 3l13 9-6 2-3 6L5 3z"),
  region: svg("M5 3H3v2m16-2h2v2M5 21H3v-2m16 2h2v-2M8 8h8v8H8z"),
  spark: svg("M12 2l1.4 5.1L18 9l-4.6 1.9L12 16l-1.4-5.1L6 9l4.6-1.9L12 2zm6 13l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z"),
};

const statusLabels: Readonly<Record<AnnotationStatus, string>> = {
  in_progress: "In progress",
  open: "Open",
  resolved: "Resolved",
  review: "Ready for review",
};

class ReviewOverlay {
  readonly #api: ReviewApiClient;
  readonly #appId: string;
  readonly #host: HTMLDivElement;
  readonly #root: ShadowRoot;
  readonly #toolbar: HTMLDivElement;
  readonly #elementButton: HTMLButtonElement;
  readonly #regionButton: HTMLButtonElement;
  readonly #commentsButton: HTMLButtonElement;
  readonly #count: HTMLSpanElement;
  readonly #panel: HTMLElement;
  readonly #panelBack: HTMLButtonElement;
  readonly #panelTitle: HTMLElement;
  readonly #panelSubtitle: HTMLElement;
  readonly #panelBody: HTMLDivElement;
  readonly #panelFooter: HTMLElement;
  readonly #pinLayer: HTMLDivElement;
  readonly #highlight: HTMLDivElement;
  readonly #highlightLabel: HTMLSpanElement;
  readonly #modeBanner: HTMLDivElement;
  readonly #modeBannerText: HTMLSpanElement;
  readonly #regionCapture: HTMLDivElement;
  readonly #regionDraft: HTMLDivElement;
  readonly #modal: HTMLDivElement;
  readonly #composerForm: HTMLFormElement;
  readonly #composerTarget: HTMLSpanElement;
  readonly #composerTextarea: HTMLTextAreaElement;
  readonly #composerSubmit: HTMLButtonElement;
  readonly #toast: HTMLDivElement;
  #annotations: readonly Annotation[] = [];
  #currentPage = currentPageUrl();
  #dragStart: Point | null = null;
  #expanded = false;
  #hoveredElement: Element | null = null;
  #mode: SelectionMode = null;
  #panelOpen = false;
  #pendingTarget: AnnotationTarget | null = null;
  #refreshSequence = 0;
  #selectedId: string | null = null;
  #toastTimer: number | undefined;

  public constructor(host: HTMLDivElement, appId: string) {
    this.#api = new ReviewApiClient(appId);
    this.#appId = appId;
    this.#host = host;
    this.#root = host.attachShadow({ mode: "open" });
    this.#root.innerHTML = markup();
    this.#toolbar = required(this.#root, "[data-ur=toolbar]");
    this.#elementButton = required(this.#root, "[data-ur=element]");
    this.#regionButton = required(this.#root, "[data-ur=region]");
    this.#commentsButton = required(this.#root, "[data-ur=comments]");
    this.#count = required(this.#root, "[data-ur=count]");
    this.#panel = required(this.#root, "[data-ur=panel]");
    this.#panelBack = required(this.#root, "[data-ur=panel-back]");
    this.#panelTitle = required(this.#root, "[data-ur=panel-title]");
    this.#panelSubtitle = required(this.#root, "[data-ur=panel-subtitle]");
    this.#panelBody = required(this.#root, "[data-ur=panel-body]");
    this.#panelFooter = required(this.#root, "[data-ur=panel-footer]");
    this.#pinLayer = required(this.#root, "[data-ur=pins]");
    this.#highlight = required(this.#root, "[data-ur=highlight]");
    this.#highlightLabel = required(this.#root, "[data-ur=highlight-label]");
    this.#modeBanner = required(this.#root, "[data-ur=mode-banner]");
    this.#modeBannerText = required(this.#root, "[data-ur=mode-text]");
    this.#regionCapture = required(this.#root, "[data-ur=region-capture]");
    this.#regionDraft = required(this.#root, "[data-ur=region-draft]");
    this.#modal = required(this.#root, "[data-ur=modal]");
    this.#composerForm = required(this.#root, "[data-ur=composer-form]");
    this.#composerTarget = required(this.#root, "[data-ur=composer-target]");
    this.#composerTextarea = required(this.#root, "[data-ur=composer-text]");
    this.#composerSubmit = required(this.#root, "[data-ur=composer-submit]");
    this.#toast = required(this.#root, "[data-ur=toast]");
    this.#bindEvents();
    this.#render();
  }

  /** Load initial feedback and begin listening for local or agent changes. */
  public async start(): Promise<void> {
    await this.#refresh();
    this.#api.subscribe(() => void this.#refresh());
    window.setInterval(() => {
      const nextPage = currentPageUrl();
      if (nextPage !== this.#currentPage) {
        this.#currentPage = nextPage;
        this.#selectedId = null;
        void this.#refresh();
      }
    }, 500);
  }

  #bindEvents(): void {
    required<HTMLButtonElement>(this.#root, "[data-ur=brand]").addEventListener("click", () => {
      this.#expanded = !this.#expanded;
      if (!this.#expanded) {
        this.#setMode(null);
        this.#panelOpen = false;
      }
      this.#render();
    });
    this.#elementButton.addEventListener("click", () => this.#setMode(this.#mode === "element" ? null : "element"));
    this.#regionButton.addEventListener("click", () => this.#setMode(this.#mode === "region" ? null : "region"));
    this.#commentsButton.addEventListener("click", () => {
      const panelOpen = !this.#panelOpen;
      this.#setMode(null);
      this.#selectedId = null;
      this.#panelOpen = panelOpen;
      this.#render();
    });
    this.#panelBack.addEventListener("click", () => {
      this.#selectedId = null;
      this.#renderPanel();
    });
    required<HTMLButtonElement>(this.#root, "[data-ur=panel-close]").addEventListener("click", () => {
      this.#panelOpen = false;
      this.#render();
    });
    required<HTMLButtonElement>(this.#root, "[data-ur=composer-cancel]").addEventListener("click", () => this.#closeComposer());
    this.#modal.addEventListener("pointerdown", (event) => {
      if (event.target === this.#modal) {
        this.#closeComposer();
      }
    });
    this.#composerTextarea.addEventListener("input", () => {
      this.#composerSubmit.disabled = this.#composerTextarea.value.trim().length === 0;
    });
    this.#composerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#submitAnnotation();
    });

    document.addEventListener("pointermove", this.#onDocumentPointerMove, true);
    document.addEventListener("click", this.#onDocumentClick, true);
    document.addEventListener("keydown", this.#onDocumentKeyDown, true);
    this.#regionCapture.addEventListener("pointerdown", this.#onRegionPointerDown);
    this.#regionCapture.addEventListener("pointermove", this.#onRegionPointerMove);
    this.#regionCapture.addEventListener("pointerup", this.#onRegionPointerUp);
    window.addEventListener("scroll", this.#schedulePositions, true);
    window.addEventListener("resize", this.#schedulePositions);
  }

  readonly #onDocumentPointerMove = (event: PointerEvent): void => {
    if (this.#mode !== "element" || this.#isReviewEvent(event)) {
      return;
    }
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element === null || element === this.#host) {
      this.#hideHighlight();
      return;
    }
    this.#hoveredElement = element;
    this.#showHighlight(element);
  };

  readonly #onDocumentClick = (event: MouseEvent): void => {
    if (this.#mode !== "element" || this.#isReviewEvent(event)) {
      return;
    }
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element === null || element === this.#host) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#pendingTarget = captureElementTarget(element);
    this.#setMode(null);
    this.#openComposer();
  };

  readonly #onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }
    if (!this.#modal.hidden) {
      this.#closeComposer();
      return;
    }
    if (this.#mode !== null) {
      this.#setMode(null);
      this.#showToast("Selection cancelled");
    }
  };

  readonly #onRegionPointerDown = (event: PointerEvent): void => {
    if (this.#mode !== "region") {
      return;
    }
    this.#regionCapture.setPointerCapture(event.pointerId);
    this.#dragStart = { x: event.clientX, y: event.clientY };
    this.#regionDraft.hidden = false;
    this.#updateDraft(this.#dragStart, this.#dragStart);
  };

  readonly #onRegionPointerMove = (event: PointerEvent): void => {
    if (this.#mode === "region" && this.#dragStart !== null) {
      this.#updateDraft(this.#dragStart, { x: event.clientX, y: event.clientY });
    }
  };

  readonly #onRegionPointerUp = (event: PointerEvent): void => {
    if (this.#mode !== "region" || this.#dragStart === null) {
      return;
    }
    const start = this.#dragStart;
    const end = { x: event.clientX, y: event.clientY };
    this.#dragStart = null;
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 12 || height < 12) {
      this.#regionDraft.hidden = true;
      this.#showToast("Draw a slightly larger area", "error");
      return;
    }

    const target: RegionTarget = {
      boundingBox: {
        height,
        width,
        x: Math.min(start.x, end.x) + window.scrollX,
        y: Math.min(start.y, end.y) + window.scrollY,
      },
      shape: "rectangle",
      type: "region",
      viewport: captureViewport(),
    };
    this.#pendingTarget = target;
    this.#setMode(null);
    this.#openComposer();
  };

  readonly #schedulePositions = (): void => {
    window.requestAnimationFrame(() => {
      this.#positionPins();
      if (this.#mode === "element" && this.#hoveredElement !== null) {
        this.#showHighlight(this.#hoveredElement);
      }
    });
  };

  #isReviewEvent(event: Event): boolean {
    return event.composedPath().includes(this.#host);
  }

  #setMode(mode: SelectionMode): void {
    this.#mode = mode;
    this.#panelOpen = false;
    this.#dragStart = null;
    this.#regionCapture.hidden = mode !== "region";
    this.#regionDraft.hidden = true;
    this.#modeBanner.hidden = mode === null;
    this.#modeBannerText.textContent = mode === "element" ? "Select an element" : "Draw a region";
    if (mode !== "element") {
      this.#hoveredElement = null;
      this.#hideHighlight();
    }
    this.#render();
  }

  #showHighlight(element: Element): void {
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      this.#hideHighlight();
      return;
    }
    Object.assign(this.#highlight.style, {
      height: `${bounds.height}px`,
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
    });
    const className = [...element.classList].slice(0, 2).map((name) => `.${name}`).join("");
    this.#highlightLabel.textContent = `${element.tagName.toLowerCase()}${className}`;
    this.#highlight.hidden = false;
  }

  #hideHighlight(): void {
    this.#highlight.hidden = true;
  }

  #updateDraft(start: Point, end: Point): void {
    Object.assign(this.#regionDraft.style, {
      height: `${Math.abs(end.y - start.y)}px`,
      left: `${Math.min(start.x, end.x)}px`,
      top: `${Math.min(start.y, end.y)}px`,
      width: `${Math.abs(end.x - start.x)}px`,
    });
  }

  #openComposer(): void {
    if (this.#pendingTarget === null) {
      return;
    }
    this.#composerTarget.textContent = targetLabel(this.#pendingTarget);
    this.#composerTextarea.value = "";
    this.#composerSubmit.disabled = true;
    this.#modal.hidden = false;
    window.requestAnimationFrame(() => this.#composerTextarea.focus());
  }

  #closeComposer(): void {
    this.#pendingTarget = null;
    this.#modal.hidden = true;
    this.#composerTextarea.value = "";
  }

  async #submitAnnotation(): Promise<void> {
    const comment = this.#composerTextarea.value.trim();
    if (this.#pendingTarget === null || comment.length === 0) {
      return;
    }
    this.#composerSubmit.disabled = true;
    try {
      const annotation = await this.#api.create({
        appId: this.#appId,
        comment,
        pageTitle: document.title,
        pageUrl: this.#currentPage,
        target: this.#pendingTarget,
      });
      this.#closeComposer();
      await this.#refresh();
      this.#selectedId = annotation.id;
      this.#panelOpen = true;
      this.#expanded = true;
      this.#render();
      this.#showToast("Comment added");
    } catch (error: unknown) {
      this.#composerSubmit.disabled = false;
      this.#showToast(errorMessage(error), "error");
    }
  }

  async #refresh(): Promise<void> {
    const sequence = ++this.#refreshSequence;
    try {
      const annotations = await this.#api.list(this.#currentPage);
      if (sequence !== this.#refreshSequence) {
        return;
      }
      this.#annotations = annotations;
      if (this.#selectedId !== null && !annotations.some((annotation) => annotation.id === this.#selectedId)) {
        this.#selectedId = null;
      }
      this.#render();
    } catch (error: unknown) {
      this.#showToast(errorMessage(error), "error");
    }
  }

  #render(): void {
    this.#toolbar.dataset.expanded = String(this.#expanded);
    this.#elementButton.dataset.active = String(this.#mode === "element");
    this.#regionButton.dataset.active = String(this.#mode === "region");
    this.#commentsButton.dataset.active = String(this.#panelOpen);
    const activeCount = this.#annotations.filter((annotation) => annotation.status !== "resolved").length;
    this.#count.textContent = String(activeCount);
    this.#count.hidden = activeCount === 0;
    this.#panel.hidden = !this.#panelOpen;
    this.#renderPins();
    this.#renderPanel();
  }

  #renderPins(): void {
    const pins = this.#annotations.map((annotation, index) => {
      const pin = document.createElement("button");
      pin.className = "ur-pin";
      pin.dataset.annotationId = annotation.id;
      pin.dataset.status = annotation.status;
      pin.type = "button";
      pin.setAttribute("aria-label", `Open annotation ${index + 1}`);
      const number = document.createElement("span");
      number.textContent = String(index + 1);
      pin.append(number);
      pin.addEventListener("click", () => {
        this.#setMode(null);
        this.#selectedId = annotation.id;
        this.#panelOpen = true;
        this.#expanded = true;
        this.#render();
      });
      return pin;
    });
    this.#pinLayer.replaceChildren(...pins);
    this.#positionPins();
  }

  #positionPins(): void {
    for (const pin of this.#pinLayer.querySelectorAll<HTMLButtonElement>(".ur-pin")) {
      const annotation = this.#annotations.find((item) => item.id === pin.dataset.annotationId);
      if (annotation === undefined) {
        continue;
      }
      const position = targetPosition(annotation.target);
      pin.style.left = `${position.x}px`;
      pin.style.top = `${position.y}px`;
      pin.style.visibility = position.visible ? "visible" : "hidden";
    }
  }

  #renderPanel(): void {
    if (!this.#panelOpen) {
      return;
    }
    const selected = this.#selectedId === null
      ? undefined
      : this.#annotations.find((annotation) => annotation.id === this.#selectedId);
    if (selected === undefined) {
      this.#renderAnnotationList();
      return;
    }
    this.#renderAnnotationDetail(selected);
  }

  #renderAnnotationList(): void {
    this.#panelBack.hidden = true;
    this.#panelTitle.textContent = "Review comments";
    const activeCount = this.#annotations.filter((annotation) => annotation.status !== "resolved").length;
    this.#panelSubtitle.textContent = activeCount === 0 ? "Nothing waiting for review" : `${activeCount} active on this page`;
    this.#panelFooter.hidden = true;
    this.#panelFooter.replaceChildren();

    if (this.#annotations.length === 0) {
      const empty = element("div", "ur-empty");
      const emptyIcon = element("div", "ur-empty-icon");
      emptyIcon.innerHTML = icons.comments;
      empty.append(emptyIcon, element("strong", "", "No comments yet"));
      empty.append(element("p", "", "Select an element or draw an area, then leave a note for your coding agent."));
      this.#panelBody.replaceChildren(empty);
      return;
    }

    const list = element("div", "ur-list");
    for (const [index, annotation] of this.#annotations.entries()) {
      list.append(this.#annotationCard(annotation, index));
    }
    this.#panelBody.replaceChildren(list);
  }

  #annotationCard(annotation: Annotation, index: number): HTMLButtonElement {
    const card = element("button", "ur-card") as HTMLButtonElement;
    card.type = "button";
    const top = element("div", "ur-card-top");
    top.append(element("span", "ur-card-index", String(index + 1)));
    top.append(element("code", "ur-target-label", targetLabel(annotation.target)));
    const status = element("span", "ur-status", statusLabels[annotation.status]);
    status.dataset.status = annotation.status;
    top.append(status);
    const firstMessage = annotation.messages[0];
    card.append(top, element("p", "ur-card-message", firstMessage?.text ?? ""));
    const meta = element("div", "ur-card-meta");
    meta.append(element("span", "", `${annotation.messages.length} ${annotation.messages.length === 1 ? "message" : "messages"}`));
    meta.append(element("time", "", formatTimestamp(annotation.updatedAt)));
    card.append(meta);
    card.addEventListener("click", () => {
      this.#selectedId = annotation.id;
      this.#renderPanel();
    });
    return card;
  }

  #renderAnnotationDetail(annotation: Annotation): void {
    const index = this.#annotations.findIndex((item) => item.id === annotation.id);
    this.#panelBack.hidden = false;
    this.#panelTitle.textContent = `Annotation ${index + 1}`;
    this.#panelSubtitle.textContent = statusLabels[annotation.status];
    const meta = element("div", "ur-detail-meta");
    meta.append(element("code", "", targetLabel(annotation.target)));
    meta.append(element("span", "", annotation.target.type === "element" ? annotation.target.domPath : regionDescription(annotation.target)));
    const thread = element("div", "ur-thread");
    for (const message of annotation.messages) {
      const wrapper = element("article", "ur-message");
      wrapper.dataset.author = message.author;
      wrapper.append(element("span", "ur-message-label", message.author === "agent" ? "Claude" : "You"));
      wrapper.append(element("div", "ur-message-bubble", message.text));
      wrapper.append(element("time", "ur-message-time", formatTimestamp(message.createdAt)));
      thread.append(wrapper);
    }
    this.#panelBody.replaceChildren(meta, thread);
    window.requestAnimationFrame(() => {
      this.#panelBody.scrollTop = this.#panelBody.scrollHeight;
    });

    const replyForm = element("form", "ur-reply-form") as HTMLFormElement;
    const textarea = element("textarea", "") as HTMLTextAreaElement;
    textarea.placeholder = "Reply in this thread…";
    textarea.rows = 1;
    const sendButton = element("button", "ur-send-button") as HTMLButtonElement;
    sendButton.type = "submit";
    sendButton.setAttribute("aria-label", "Send reply");
    sendButton.innerHTML = icons.arrowUp;
    replyForm.append(textarea, sendButton);
    replyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (text.length === 0) {
        return;
      }
      sendButton.disabled = true;
      void this.#api.reply(annotation.id, text)
        .then(async () => {
          textarea.value = "";
          await this.#refresh();
          this.#showToast("Reply sent");
        })
        .catch((error: unknown) => this.#showToast(errorMessage(error), "error"))
        .finally(() => {
          sendButton.disabled = false;
        });
    });

    const actions = element("div", "ur-detail-actions");
    const deleteButton = element("button", "ur-delete-button", "Delete annotation") as HTMLButtonElement;
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => {
      if (!window.confirm("Delete this annotation?")) {
        return;
      }
      void this.#api.delete(annotation.id)
        .then(async () => {
          this.#selectedId = null;
          await this.#refresh();
          this.#showToast("Annotation deleted");
        })
        .catch((error: unknown) => this.#showToast(errorMessage(error), "error"));
    });
    const statusSelect = element("select", "ur-status-select") as HTMLSelectElement;
    for (const status of ["open", "in_progress", "review", "resolved"] as const) {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = statusLabels[status];
      option.selected = annotation.status === status;
      statusSelect.append(option);
    }
    statusSelect.addEventListener("change", () => {
      const nextStatus = statusSelect.value;
      if (!isAnnotationStatus(nextStatus)) {
        this.#showToast("Unsupported annotation status", "error");
        return;
      }
      statusSelect.disabled = true;
      void this.#api.setStatus(annotation.id, nextStatus)
        .then(async () => {
          await this.#refresh();
          this.#showToast(`Status changed to ${statusLabels[nextStatus]}`);
        })
        .catch((error: unknown) => this.#showToast(errorMessage(error), "error"))
        .finally(() => {
          statusSelect.disabled = false;
        });
    });
    actions.append(deleteButton, statusSelect);
    this.#panelFooter.hidden = false;
    this.#panelFooter.replaceChildren(replyForm, actions);
  }

  #showToast(message: string, kind: "error" | "success" = "success"): void {
    if (this.#toastTimer !== undefined) {
      window.clearTimeout(this.#toastTimer);
    }
    this.#toast.textContent = message;
    this.#toast.dataset.kind = kind;
    this.#toast.hidden = false;
    this.#toastTimer = window.setTimeout(() => {
      this.#toast.hidden = true;
      this.#toastTimer = undefined;
    }, 2_600);
  }
}

function markup(): string {
  return `
    <style>${overlayStyles}</style>
    <div class="ur-pin-layer" data-ur="pins"></div>
    <div class="ur-highlight" data-ur="highlight" hidden><span class="ur-highlight-label" data-ur="highlight-label"></span></div>
    <div class="ur-mode-banner" data-ur="mode-banner" hidden><strong data-ur="mode-text"></strong><span>Esc to cancel</span></div>
    <div class="ur-region-capture" data-ur="region-capture" hidden><div class="ur-region-draft" data-ur="region-draft" hidden></div></div>
    <aside class="ur-panel" data-ur="panel" aria-label="UI Review comments" hidden>
      <header class="ur-panel-header">
        <button class="ur-icon-button" data-ur="panel-back" type="button" aria-label="Back">${icons.arrowLeft}</button>
        <div class="ur-panel-heading"><h2 class="ur-panel-title" data-ur="panel-title"></h2><p class="ur-panel-subtitle" data-ur="panel-subtitle"></p></div>
        <button class="ur-icon-button" data-ur="panel-close" type="button" aria-label="Close comments">${icons.close}</button>
      </header>
      <div class="ur-panel-body" data-ur="panel-body"></div>
      <footer class="ur-panel-footer" data-ur="panel-footer" hidden></footer>
    </aside>
    <div class="ur-modal-backdrop" data-ur="modal" hidden>
      <form class="ur-composer" data-ur="composer-form">
        <header class="ur-composer-head"><span class="ur-composer-icon">${icons.comments}</span><div><strong>Leave feedback</strong><span class="ur-composer-target" data-ur="composer-target"></span></div></header>
        <div class="ur-composer-body"><textarea data-ur="composer-text" placeholder="What should change, and what result do you want?" maxlength="20000" required></textarea><p class="ur-composer-hint">The element, styles, position, and page context are attached automatically.</p></div>
        <footer class="ur-composer-actions"><button class="ur-button ur-button-secondary" data-ur="composer-cancel" type="button">Cancel</button><button class="ur-button ur-button-primary" data-ur="composer-submit" type="submit" disabled>Add comment</button></footer>
      </form>
    </div>
    <div class="ur-toast" data-ur="toast" hidden></div>
    <div class="ur-toolbar" data-expanded="false" data-ur="toolbar" role="toolbar" aria-label="UI Review">
      <button class="ur-brand" data-ur="brand" type="button" aria-label="Toggle UI Review">${icons.spark}</button>
      <div class="ur-actions">
        <button class="ur-tool-button" data-active="false" data-ur="element" type="button">${icons.cursor}<span class="ur-tool-label">Element</span></button>
        <button class="ur-tool-button" data-active="false" data-ur="region" type="button">${icons.region}<span class="ur-tool-label">Area</span></button>
        <span class="ur-divider"></span>
        <button class="ur-tool-button" data-active="false" data-ur="comments" type="button">${icons.comments}<span class="ur-tool-label">Comments</span><span class="ur-count" data-ur="count" hidden></span></button>
      </div>
    </div>
  `;
}

function svg(path: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"></path></svg>`;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (value === null) {
    throw new Error(`UI Review markup is missing ${selector}`);
  }
  return value;
}

function element(tagName: string, className: string, text?: string): HTMLElement {
  const value = document.createElement(tagName);
  value.className = className;
  if (text !== undefined) {
    value.textContent = text;
  }
  return value;
}

function targetLabel(target: AnnotationTarget): string {
  return target.type === "element" ? target.selector : regionDescription(target);
}

function regionDescription(target: RegionTarget): string {
  return `Area ${Math.round(target.boundingBox.width)}×${Math.round(target.boundingBox.height)} at ${Math.round(target.boundingBox.x)}, ${Math.round(target.boundingBox.y)}`;
}

function targetPosition(target: AnnotationTarget): { readonly visible: boolean; readonly x: number; readonly y: number } {
  let x: number;
  let y: number;
  if (target.type === "element") {
    let element: Element | null = null;
    try {
      element = document.querySelector(target.selector);
    } catch {
      element = null;
    }
    if (element !== null) {
      const bounds = element.getBoundingClientRect();
      x = bounds.left + Math.min(Math.max(bounds.width / 2, 14), 34);
      y = bounds.top + 4;
    } else {
      x = target.boundingBox.x - window.scrollX + 16;
      y = target.boundingBox.y - window.scrollY + 4;
    }
  } else {
    x = target.boundingBox.x - window.scrollX + target.boundingBox.width / 2;
    y = target.boundingBox.y - window.scrollY + 4;
  }
  return {
    visible: x >= -20 && x <= window.innerWidth + 20 && y >= -20 && y <= window.innerHeight + 40,
    x: Math.min(Math.max(x, 16), window.innerWidth - 16),
    y: Math.min(Math.max(y, 32), window.innerHeight - 12),
  };
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected UI Review error";
}

if (!document.querySelector("[data-ui-review-root]")) {
  const reviewScript = document.querySelector<HTMLScriptElement>("script[data-ui-review-app][src^='/__ui_review/browser.js']");
  const appId = reviewScript?.dataset.uiReviewApp;
  if (appId === undefined || appId.length === 0) {
    throw new Error("UI Review app identity is missing from the injected browser script");
  }
  const host = document.createElement("div");
  host.dataset.uiReviewRoot = "";
  document.body.append(host);
  const overlay = new ReviewOverlay(host, appId);
  void overlay.start();
}
