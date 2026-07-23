import {
  isAnnotationStatus,
  type Annotation,
  type AnnotationStatus,
  type AnnotationTarget,
  type RegionTarget,
  type ScreenshotAttachment,
} from "../shared/types.js";
import { formatAgentInstruction } from "./agent-instruction.js";
import { ReviewApiClient } from "./api-client.js";
import { captureElementTarget, captureViewport, currentPageUrl, subscribeToPageChanges } from "./targeting.js";
import { overlayStyles } from "./styles.js";

type CaptureMode = "element" | "region";

type InteractionState =
  | { readonly kind: "idle" }
  | { readonly kind: "capturing"; readonly mode: CaptureMode; readonly retargetId?: string }
  | { readonly kind: "composing"; readonly mode: CaptureMode; readonly target: AnnotationTarget }
  | { readonly kind: "reviewing" };

type Point = {
  readonly x: number;
  readonly y: number;
};

type PendingScreenshot = {
  readonly dimensions: { readonly height: number; readonly width: number };
  readonly file: File;
  readonly previewUrl: string;
};

type ReviewScope = "app" | "page";
type StatusFilter = "active" | "all" | AnnotationStatus;
type AgentFilter = "all" | "replied" | "ready" | "waiting";

const icons = {
  arrowLeft: svg("M15 18l-6-6 6-6M9 12h10"),
  arrowUp: svg("M12 19V5m0 0L6 11m6-6 6 6"),
  camera: svg("M4 7h3l1.5-2h7L17 7h3v11H4V7zm8 3a3 3 0 100 6 3 3 0 000-6z"),
  check: svg("M5 12l4 4L19 6"),
  chevronRight: svg("M9 6l6 6-6 6"),
  close: svg("M6 6l12 12M18 6L6 18"),
  comments: svg("M20 15a4 4 0 01-4 4H8l-4 3V7a4 4 0 014-4h8a4 4 0 014 4v8z"),
  copy: svg("M9 9h10v10H9V9zM5 15H4V5h10v1"),
  cursor: svg("M5 3l13 9-6 2-3 6L5 3z"),
  edit: svg("M4 20h4l11-11-4-4L4 16v4zM13.5 6.5l4 4"),
  globe: svg("M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18M4.5 7h15M4.5 17h15"),
  locate: svg("M12 3v3m0 12v3M3 12h3m12 0h3m-5 0a4 4 0 11-8 0 4 4 0 018 0z"),
  region: svg("M5 3H3v2m16-2h2v2M5 21H3v-2m16 2h2v-2M8 8h8v8H8z"),
  reopen: svg("M4 8V4m0 0h4M4 4l4 4a7 7 0 101-2"),
  spark: svg("M12 2l1.4 5.1L18 9l-4.6 1.9L12 16l-1.4-5.1L6 9l4.6-1.9L12 2zm6 13l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z"),
  trash: svg("M4 7h16M9 7V4h6v3m3 0l-1 13H7L6 7m4 4v5m4-5v5"),
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
  readonly #includeHash: boolean;
  readonly #host: HTMLDivElement;
  readonly #root: ShadowRoot;
  readonly #toolbar: HTMLDivElement;
  readonly #elementButton: HTMLButtonElement;
  readonly #regionButton: HTMLButtonElement;
  readonly #commentsButton: HTMLButtonElement;
  readonly #count: HTMLSpanElement;
  readonly #panel: HTMLElement;
  readonly #panelBack: HTMLButtonElement;
  readonly #panelClose: HTMLButtonElement;
  readonly #panelCopy: HTMLButtonElement;
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
  readonly #screenshotInput: HTMLInputElement;
  readonly #screenshotPreview: HTMLDivElement;
  readonly #preview: HTMLDivElement;
  readonly #previewMessage: HTMLParagraphElement;
  readonly #previewMeta: HTMLSpanElement;
  readonly #toast: HTMLDivElement;
  #annotations: readonly Annotation[] = [];
  readonly #annotationById = new Map<string, Annotation>();
  readonly #pinElements = new Map<string, HTMLButtonElement>();
  #currentPage: string;
  #dragStart: Point | null = null;
  #expanded = false;
  #hoveredElement: Element | null = null;
  #interaction: InteractionState = { kind: "idle" };
  #reviewScope: ReviewScope = "page";
  #statusFilter: StatusFilter = "active";
  #agentFilter: AgentFilter = "all";
  #routeFilter = "*";
  #pendingScreenshot: PendingScreenshot | null = null;
  #refreshSequence = 0;
  #selectedId: string | null = null;
  readonly #selectedIds = new Set<string>();
  #editingCommentId: string | null = null;
  #returnFocus: HTMLElement | null = null;
  #panelReturnAnnotationId: string | null = null;
  #positionFrame: number | undefined;
  #pointerFrame: number | undefined;
  #pendingPointer: Point | null = null;
  #regionFrame: number | undefined;
  #pendingRegionEnd: Point | null = null;
  #previewTimer: number | undefined;
  #spotlightTimer: number | undefined;
  #refreshQueued = false;
  #inertElements: Array<{
    readonly element: HTMLElement;
    readonly previousAriaHidden: string | null;
    readonly wasInert: boolean;
  }> = [];
  #toastTimer: number | undefined;

  public constructor(host: HTMLDivElement, appId: string, includeHash: boolean, nonce: string) {
    this.#api = new ReviewApiClient(appId);
    this.#appId = appId;
    this.#includeHash = includeHash;
    this.#currentPage = currentPageUrl(window.location, includeHash);
    this.#host = host;
    this.#root = host.attachShadow({ mode: "open" });
    this.#root.innerHTML = markup(nonce);
    this.#toolbar = required(this.#root, "[data-ur=toolbar]");
    this.#elementButton = required(this.#root, "[data-ur=element]");
    this.#regionButton = required(this.#root, "[data-ur=region]");
    this.#commentsButton = required(this.#root, "[data-ur=comments]");
    this.#count = required(this.#root, "[data-ur=count]");
    this.#panel = required(this.#root, "[data-ur=panel]");
    this.#panelBack = required(this.#root, "[data-ur=panel-back]");
    this.#panelClose = required(this.#root, "[data-ur=panel-close]");
    this.#panelCopy = required(this.#root, "[data-ur=panel-copy]");
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
    this.#screenshotInput = required(this.#root, "[data-ur=screenshot-input]");
    this.#screenshotPreview = required(this.#root, "[data-ur=screenshot-preview]");
    this.#preview = required(this.#root, "[data-ur=preview]");
    this.#previewMessage = required(this.#root, "[data-ur=preview-message]");
    this.#previewMeta = required(this.#root, "[data-ur=preview-meta]");
    this.#toast = required(this.#root, "[data-ur=toast]");
    this.#bindEvents();
    this.#render();
  }

  /** Load initial feedback and begin listening for local or agent changes. */
  public async start(): Promise<void> {
    await this.#refresh();
    this.#api.subscribe(this.#queueRefresh);
    subscribeToPageChanges(this.#handlePageChange);
    window.setInterval(this.#handlePageChange, 2_000);
  }

  readonly #queueRefresh = (): void => {
    if (this.#refreshQueued) {
      return;
    }
    this.#refreshQueued = true;
    window.queueMicrotask(() => {
      this.#refreshQueued = false;
      void this.#refresh();
    });
  };

  readonly #handlePageChange = (): void => {
    const nextPage = currentPageUrl(window.location, this.#includeHash);
    if (nextPage === this.#currentPage) {
      return;
    }
    this.#currentPage = nextPage;
    this.#selectedId = null;
    this.#selectedIds.clear();
    this.#editingCommentId = null;
    this.#interaction = { kind: "idle" };
    this.#render();
    this.#queueRefresh();
  };

  #bindEvents(): void {
    required<HTMLButtonElement>(this.#root, "[data-ur=brand]").addEventListener("click", () => {
      this.#expanded = !this.#expanded;
      if (!this.#expanded) {
        this.#setInteraction({ kind: "idle" });
      } else {
        this.#render();
      }
    });
    this.#elementButton.addEventListener("click", () => {
      this.#toggleCaptureMode("element");
    });
    this.#regionButton.addEventListener("click", () => {
      this.#toggleCaptureMode("region");
    });
    this.#commentsButton.addEventListener("click", () => {
      const nextInteraction: InteractionState = this.#interaction.kind === "reviewing"
        ? { kind: "idle" }
        : { kind: "reviewing" };
      this.#selectedId = null;
      this.#editingCommentId = null;
      this.#setInteraction(nextInteraction);
    });
    this.#panelBack.addEventListener("click", () => {
      this.#selectedId = null;
      this.#editingCommentId = null;
      this.#renderPanel();
      window.requestAnimationFrame(() => this.#restorePanelFocus());
    });
    this.#panelClose.addEventListener("click", () => {
      this.#setInteraction({ kind: "idle" });
      window.requestAnimationFrame(() => this.#commentsButton.focus());
    });
    this.#panelCopy.addEventListener("click", () => {
      const activeAnnotations = this.#filteredAnnotations()
        .filter((annotation) => annotation.status !== "resolved");
      void this.#copyAnnotationsForAgent(activeAnnotations);
    });
    required<HTMLButtonElement>(this.#root, "[data-ur=composer-cancel]").addEventListener("click", () => {
      this.#closeComposer(true);
    });
    this.#modal.addEventListener("pointerdown", (event) => {
      if (event.target === this.#modal) {
        this.#closeComposer(true);
      }
    });
    this.#composerTextarea.addEventListener("input", () => {
      this.#composerSubmit.disabled = this.#composerTextarea.value.trim().length === 0;
    });
    this.#composerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#submitAnnotation();
    });
    this.#composerTextarea.addEventListener("paste", (event) => {
      const screenshot = [...(event.clipboardData?.files ?? [])].find((file) => file.type.startsWith("image/"));
      if (screenshot !== undefined) {
        event.preventDefault();
        void this.#setPendingScreenshot(screenshot);
      }
    });
    this.#screenshotInput.addEventListener("change", () => {
      const screenshot = this.#screenshotInput.files?.[0];
      if (screenshot !== undefined) {
        void this.#setPendingScreenshot(screenshot);
      }
    });
    required<HTMLButtonElement>(this.#root, "[data-ur=screenshot-choose]").addEventListener("click", () => {
      this.#screenshotInput.click();
    });
    required<HTMLButtonElement>(this.#root, "[data-ur=screenshot-remove]").addEventListener("click", () => {
      this.#clearPendingScreenshot();
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
    if (
      this.#interaction.kind !== "capturing"
      || this.#interaction.mode !== "element"
      || this.#isReviewEvent(event)
    ) {
      return;
    }
    this.#pendingPointer = { x: event.clientX, y: event.clientY };
    if (this.#pointerFrame !== undefined) {
      return;
    }
    this.#pointerFrame = window.requestAnimationFrame(() => {
      this.#pointerFrame = undefined;
      const point = this.#pendingPointer;
      this.#pendingPointer = null;
      if (point === null) {
        return;
      }
      const element = document.elementFromPoint(point.x, point.y);
      if (element === null || element === this.#host) {
        this.#hideHighlight();
        return;
      }
      this.#hoveredElement = element;
      this.#showHighlight(element);
    });
  };

  readonly #onDocumentClick = (event: MouseEvent): void => {
    if (
      this.#interaction.kind !== "capturing"
      || this.#interaction.mode !== "element"
      || this.#isReviewEvent(event)
    ) {
      return;
    }
    const captureState = this.#interaction;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element === null || element === this.#host) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#returnFocus = element instanceof HTMLElement ? element : this.#elementButton;
    const target = captureElementTarget(element);
    if (captureState.retargetId !== undefined) {
      void this.#retargetAnnotation(captureState.retargetId, target);
      return;
    }
    this.#openComposer(target, "element");
  };

  readonly #onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!this.#modal.hidden && event.key === "Tab") {
      this.#trapComposerFocus(event);
      return;
    }
    if (event.key !== "Escape") {
      return;
    }
    if (!this.#modal.hidden) {
      this.#closeComposer(true);
      return;
    }
    if (this.#interaction.kind === "capturing") {
      this.#setInteraction({ kind: "idle" });
      this.#showToast("Selection cancelled");
      return;
    }
    if (this.#interaction.kind === "reviewing") {
      this.#setInteraction({ kind: "idle" });
      this.#commentsButton.focus();
    }
  };

  readonly #onRegionPointerDown = (event: PointerEvent): void => {
    if (this.#interaction.kind !== "capturing" || this.#interaction.mode !== "region") {
      return;
    }
    this.#regionCapture.setPointerCapture(event.pointerId);
    this.#dragStart = { x: event.clientX, y: event.clientY };
    this.#regionDraft.hidden = false;
    this.#updateDraft(this.#dragStart, this.#dragStart);
  };

  readonly #onRegionPointerMove = (event: PointerEvent): void => {
    if (
      this.#interaction.kind !== "capturing"
      || this.#interaction.mode !== "region"
      || this.#dragStart === null
    ) {
      return;
    }
    this.#pendingRegionEnd = { x: event.clientX, y: event.clientY };
    if (this.#regionFrame === undefined) {
      this.#regionFrame = window.requestAnimationFrame(() => {
        this.#regionFrame = undefined;
        if (this.#dragStart !== null && this.#pendingRegionEnd !== null) {
          this.#updateDraft(this.#dragStart, this.#pendingRegionEnd);
        }
      });
    }
  };

  readonly #onRegionPointerUp = (event: PointerEvent): void => {
    if (
      this.#interaction.kind !== "capturing"
      || this.#interaction.mode !== "region"
      || this.#dragStart === null
    ) {
      return;
    }
    const captureState = this.#interaction;
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
    this.#returnFocus = this.#regionButton;
    if (captureState.retargetId !== undefined) {
      void this.#retargetAnnotation(captureState.retargetId, target);
      return;
    }
    this.#openComposer(target, "region");
  };

  readonly #schedulePositions = (): void => {
    if (this.#positionFrame !== undefined) {
      return;
    }
    this.#positionFrame = window.requestAnimationFrame(() => {
      this.#positionFrame = undefined;
      this.#positionPins();
      if (
        this.#interaction.kind === "capturing"
        && this.#interaction.mode === "element"
        && this.#hoveredElement !== null
      ) {
        this.#showHighlight(this.#hoveredElement);
      }
    });
  };

  #isReviewEvent(event: Event): boolean {
    return event.composedPath().includes(this.#host);
  }

  #toggleCaptureMode(mode: CaptureMode): void {
    const isActive = this.#interaction.kind === "capturing"
      && this.#interaction.mode === mode
      && this.#interaction.retargetId === undefined;
    this.#setInteraction(isActive ? { kind: "idle" } : { kind: "capturing", mode });
  }

  #setInteraction(interaction: InteractionState): void {
    this.#interaction = interaction;
    this.#dragStart = null;
    this.#pendingRegionEnd = null;
    const isCapturingRegion = interaction.kind === "capturing" && interaction.mode === "region";
    this.#regionCapture.hidden = !isCapturingRegion;
    this.#regionDraft.hidden = true;
    this.#modeBanner.hidden = interaction.kind !== "capturing";
    if (interaction.kind === "capturing") {
      const action = interaction.mode === "element" ? "Select an element" : "Draw a region";
      this.#modeBannerText.textContent = interaction.retargetId === undefined ? action : `${action} to re-anchor`;
    }
    if (interaction.kind !== "capturing" || interaction.mode !== "element") {
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

  #openComposer(target: AnnotationTarget, mode: CaptureMode): void {
    this.#interaction = { kind: "composing", mode, target };
    this.#regionCapture.hidden = true;
    this.#regionDraft.hidden = true;
    this.#modeBanner.hidden = true;
    this.#hideHighlight();
    this.#composerTarget.textContent = targetLabel(target);
    this.#composerTextarea.value = "";
    this.#composerSubmit.disabled = true;
    this.#clearPendingScreenshot();
    this.#makeTargetPageInert();
    this.#modal.hidden = false;
    this.#render();
    window.requestAnimationFrame(() => this.#composerTextarea.focus());
  }

  #closeComposer(resumeCapture: boolean): void {
    const captureMode = this.#interaction.kind === "composing" ? this.#interaction.mode : null;
    this.#modal.hidden = true;
    this.#composerTextarea.value = "";
    this.#clearPendingScreenshot();
    this.#restoreTargetPage();
    const returnFocus = this.#returnFocus;
    this.#returnFocus = null;
    this.#setInteraction(
      resumeCapture && captureMode !== null
        ? { kind: "capturing", mode: captureMode }
        : { kind: "idle" },
    );
    window.requestAnimationFrame(() => {
      if (resumeCapture) {
        (captureMode === "region" ? this.#regionButton : this.#elementButton).focus();
      } else {
        returnFocus?.focus();
      }
    });
  }

  async #setPendingScreenshot(file: File): Promise<void> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      this.#showToast("Use a PNG, JPEG, or WebP screenshot", "error");
      return;
    }
    if (file.size > 8_000_000) {
      this.#showToast("Screenshot must be smaller than 8 MB", "error");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    try {
      const dimensions = await imageDimensions(previewUrl);
      this.#clearPendingScreenshot();
      this.#pendingScreenshot = { dimensions, file, previewUrl };
      const image = required<HTMLImageElement>(this.#screenshotPreview, "[data-ur=screenshot-image]");
      const name = required<HTMLElement>(this.#screenshotPreview, "[data-ur=screenshot-name]");
      image.src = previewUrl;
      image.alt = `Attached screenshot: ${file.name}`;
      name.textContent = `${file.name} · ${String(dimensions.width)}×${String(dimensions.height)}`;
      this.#screenshotPreview.hidden = false;
    } catch {
      URL.revokeObjectURL(previewUrl);
      this.#showToast("The screenshot could not be read", "error");
    } finally {
      this.#screenshotInput.value = "";
    }
  }

  #clearPendingScreenshot(): void {
    if (this.#pendingScreenshot !== null) {
      URL.revokeObjectURL(this.#pendingScreenshot.previewUrl);
    }
    this.#pendingScreenshot = null;
    this.#screenshotPreview.hidden = true;
    const image = this.#screenshotPreview.querySelector<HTMLImageElement>("[data-ur=screenshot-image]");
    if (image !== null) {
      image.removeAttribute("src");
      image.alt = "";
    }
    const name = this.#screenshotPreview.querySelector<HTMLElement>("[data-ur=screenshot-name]");
    if (name !== null) {
      name.textContent = "";
    }
  }

  #makeTargetPageInert(): void {
    this.#inertElements = [...document.body.children]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== this.#host)
      .map((element) => ({
        element,
        previousAriaHidden: element.getAttribute("aria-hidden"),
        wasInert: element.inert,
      }));
    for (const { element } of this.#inertElements) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }
    this.#toolbar.setAttribute("aria-hidden", "true");
    this.#pinLayer.setAttribute("aria-hidden", "true");
    this.#panel.setAttribute("aria-hidden", "true");
  }

  #restoreTargetPage(): void {
    for (const { element, previousAriaHidden, wasInert } of this.#inertElements) {
      element.inert = wasInert;
      if (previousAriaHidden === null) {
        element.removeAttribute("aria-hidden");
      } else {
        element.setAttribute("aria-hidden", previousAriaHidden);
      }
    }
    this.#inertElements = [];
    this.#toolbar.removeAttribute("aria-hidden");
    this.#pinLayer.removeAttribute("aria-hidden");
    this.#panel.removeAttribute("aria-hidden");
  }

  #trapComposerFocus(event: KeyboardEvent): void {
    const focusable = [...this.#composerForm.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled])")];
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }
    if (event.shiftKey && this.#root.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.#root.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async #submitAnnotation(): Promise<void> {
    const comment = this.#composerTextarea.value.trim();
    if (this.#interaction.kind !== "composing" || comment.length === 0) {
      return;
    }
    const composing = this.#interaction;
    const pendingScreenshot = this.#pendingScreenshot;
    this.#composerSubmit.disabled = true;
    try {
      const screenshot = pendingScreenshot === null
        ? undefined
        : await this.#api.uploadScreenshot(pendingScreenshot.file, pendingScreenshot.dimensions);
      const annotation = await this.#api.create({
        appId: this.#appId,
        comment,
        pageTitle: document.title,
        pageUrl: this.#currentPage,
        ...(screenshot === undefined ? {} : { screenshots: [screenshot] }),
        target: composing.target,
      });
      this.#closeComposer(true);
      await this.#refresh();
      this.#expanded = true;
      this.#render();
      this.#showToast("Comment added", "success", {
        icon: icons.comments,
        label: "Open",
        onClick: () => this.#openAnnotation(annotation.id),
      });
    } catch (error: unknown) {
      this.#composerSubmit.disabled = false;
      this.#showToast(errorMessage(error), "error");
    }
  }

  async #refresh(): Promise<void> {
    const sequence = ++this.#refreshSequence;
    try {
      const annotations = await this.#api.list();
      if (sequence !== this.#refreshSequence) {
        return;
      }
      this.#annotations = annotations;
      this.#annotationById.clear();
      for (const annotation of annotations) {
        this.#annotationById.set(annotation.id, annotation);
      }
      for (const annotationId of this.#selectedIds) {
        const annotation = this.#annotationById.get(annotationId);
        if (annotation === undefined || annotation.status === "resolved") {
          this.#selectedIds.delete(annotationId);
        }
      }
      if (this.#selectedId !== null && !this.#annotationById.has(this.#selectedId)) {
        this.#selectedId = null;
      }
      this.#render();
    } catch (error: unknown) {
      this.#showToast(errorMessage(error), "error");
    }
  }

  #render(): void {
    const panelOpen = this.#interaction.kind === "reviewing";
    const captureMode = this.#interaction.kind === "capturing" ? this.#interaction.mode : null;
    this.#toolbar.dataset.expanded = String(this.#expanded);
    this.#toolbar.dataset.panelOpen = String(panelOpen);
    required<HTMLButtonElement>(this.#root, "[data-ur=brand]").setAttribute("aria-expanded", String(this.#expanded));
    this.#elementButton.dataset.active = String(captureMode === "element");
    this.#elementButton.setAttribute("aria-pressed", String(captureMode === "element"));
    this.#regionButton.dataset.active = String(captureMode === "region");
    this.#regionButton.setAttribute("aria-pressed", String(captureMode === "region"));
    this.#commentsButton.dataset.active = String(panelOpen);
    this.#commentsButton.setAttribute("aria-expanded", String(panelOpen));
    const activeCount = this.#currentPageAnnotations()
      .filter((annotation) => annotation.status !== "resolved")
      .length;
    this.#count.textContent = String(activeCount);
    this.#count.hidden = activeCount === 0;
    this.#panel.hidden = !panelOpen;
    this.#renderPins();
    this.#renderPanel();
  }

  #renderPins(): void {
    const annotations = this.#currentPageAnnotations()
      .filter((annotation) => annotation.status !== "resolved");
    const desiredIds = new Set(annotations.map((annotation) => annotation.id));
    for (const [annotationId, pin] of this.#pinElements) {
      if (!desiredIds.has(annotationId)) {
        pin.remove();
        this.#pinElements.delete(annotationId);
      }
    }
    const orderedPins = annotations.map((annotation, index) => {
      let pin = this.#pinElements.get(annotation.id);
      if (pin === undefined) {
        const createdPin = document.createElement("button");
        createdPin.className = "ur-pin";
        createdPin.dataset.annotationId = annotation.id;
        createdPin.type = "button";
        const number = document.createElement("span");
        createdPin.append(number);
        createdPin.addEventListener("click", () => {
          const annotationId = createdPin.dataset.annotationId;
          if (annotationId !== undefined) {
            this.#openAnnotation(annotationId);
          }
        });
        createdPin.addEventListener("pointerenter", () => this.#showPinPreview(annotation.id, createdPin));
        createdPin.addEventListener("pointerleave", () => this.#hidePinPreview());
        createdPin.addEventListener("focus", () => this.#showPinPreview(annotation.id, createdPin));
        createdPin.addEventListener("blur", () => this.#hidePinPreview());
        this.#pinElements.set(annotation.id, createdPin);
        pin = createdPin;
      }
      pin.dataset.status = annotation.status;
      pin.setAttribute("aria-label", `Open annotation ${index + 1}`);
      const number = pin.querySelector("span");
      if (number !== null) {
        number.textContent = String(index + 1);
      }
      return pin;
    });
    this.#pinLayer.append(...orderedPins);
    this.#positionPins();
  }

  #positionPins(): void {
    for (const [annotationId, pin] of this.#pinElements) {
      const annotation = this.#annotationById.get(annotationId);
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
    if (this.#interaction.kind !== "reviewing") {
      return;
    }
    const activeAnnotations = this.#filteredAnnotations()
      .filter((annotation) => annotation.status !== "resolved");
    this.#panelCopy.disabled = activeAnnotations.length === 0;
    this.#panelCopy.title = activeAnnotations.length === 0
      ? "No active annotations to copy"
      : `Copy ${String(activeAnnotations.length)} active ${activeAnnotations.length === 1 ? "annotation" : "annotations"} for agent`;
    const selected = this.#selectedId === null
      ? undefined
      : this.#annotationById.get(this.#selectedId);
    if (selected === undefined) {
      this.#renderAnnotationList();
      return;
    }
    this.#renderAnnotationDetail(selected);
  }

  #currentPageAnnotations(): readonly Annotation[] {
    return this.#annotations.filter((annotation) => annotation.pageUrl === this.#currentPage);
  }

  #openAnnotation(annotationId: string): void {
    if (!this.#annotationById.has(annotationId)) {
      return;
    }
    this.#panelReturnAnnotationId = annotationId;
    this.#selectedId = annotationId;
    this.#editingCommentId = null;
    this.#expanded = true;
    this.#setInteraction({ kind: "reviewing" });
    window.requestAnimationFrame(() => this.#panelBack.focus());
  }

  #renderAnnotationList(): void {
    this.#panelBack.hidden = true;
    this.#panelTitle.textContent = "Review comments";
    const visibleAnnotations = this.#filteredAnnotations();
    const activeAnnotations = visibleAnnotations.filter((annotation) => annotation.status !== "resolved");
    const scopeLabel = this.#reviewScope === "page" ? "on this page" : "across this app";
    this.#panelSubtitle.textContent = activeAnnotations.length === 0
      ? `Nothing waiting ${scopeLabel}`
      : `${String(activeAnnotations.length)} active ${scopeLabel}`;
    this.#panelFooter.hidden = true;
    this.#panelFooter.replaceChildren();

    const filters = this.#filterControls();
    if (this.#annotations.length === 0) {
      const empty = element("div", "ur-empty");
      const emptyIcon = element("div", "ur-empty-icon");
      emptyIcon.innerHTML = icons.comments;
      empty.append(emptyIcon, element("strong", "", "No comments yet"));
      empty.append(element("p", "", "Select an element or draw an area, then leave a note for your coding agent."));
      this.#panelBody.replaceChildren(filters, empty);
      return;
    }

    const bulkBar = element("div", "ur-bulk-bar");
    const selectLabel = element("label", "ur-select-all");
    const selectAll = document.createElement("input");
    selectAll.type = "checkbox";
    selectAll.checked = activeAnnotations.length > 0 && activeAnnotations.every((annotation) => this.#selectedIds.has(annotation.id));
    selectAll.indeterminate = !selectAll.checked && activeAnnotations.some((annotation) => this.#selectedIds.has(annotation.id));
    selectAll.disabled = activeAnnotations.length === 0;
    selectAll.addEventListener("change", () => {
      for (const annotation of activeAnnotations) {
        if (selectAll.checked) {
          this.#selectedIds.add(annotation.id);
        } else {
          this.#selectedIds.delete(annotation.id);
        }
      }
      this.#renderPanel();
    });
    selectLabel.append(selectAll, document.createTextNode("Select active"));
    const visibleSelectedIds = activeAnnotations
      .filter((annotation) => this.#selectedIds.has(annotation.id))
      .map((annotation) => annotation.id);
    const resolveSelected = element("button", "ur-bulk-resolve") as HTMLButtonElement;
    resolveSelected.type = "button";
    resolveSelected.disabled = visibleSelectedIds.length === 0;
    setButtonContent(resolveSelected, icons.check, `Resolve selected (${String(visibleSelectedIds.length)})`);
    resolveSelected.addEventListener("click", () => void this.#resolveAnnotations(visibleSelectedIds));
    bulkBar.append(selectLabel, resolveSelected);

    const list = element("div", "ur-list");
    for (const [index, annotation] of visibleAnnotations.entries()) {
      list.append(this.#annotationCard(annotation, index));
    }
    if (visibleAnnotations.length === 0) {
      const empty = element("div", "ur-inline-empty");
      empty.append(element("strong", "", "No matching comments"));
      empty.append(element("p", "", "Adjust the scope or filters to see more feedback."));
      list.append(empty);
    }
    this.#panelBody.replaceChildren(filters, bulkBar, list);
  }

  #filterControls(): HTMLElement {
    const filters = element("div", "ur-filters");
    const scope = element("div", "ur-scope");
    const pageButton = element("button", "ur-filter-button") as HTMLButtonElement;
    pageButton.type = "button";
    pageButton.dataset.active = String(this.#reviewScope === "page");
    pageButton.setAttribute("aria-pressed", String(this.#reviewScope === "page"));
    setButtonContent(pageButton, icons.locate, "This page");
    pageButton.addEventListener("click", () => {
      this.#reviewScope = "page";
      this.#routeFilter = "*";
      this.#selectedIds.clear();
      this.#renderPanel();
    });
    const appButton = element("button", "ur-filter-button") as HTMLButtonElement;
    appButton.type = "button";
    appButton.dataset.active = String(this.#reviewScope === "app");
    appButton.setAttribute("aria-pressed", String(this.#reviewScope === "app"));
    setButtonContent(appButton, icons.globe, "All pages");
    appButton.addEventListener("click", () => {
      this.#reviewScope = "app";
      this.#selectedIds.clear();
      this.#renderPanel();
    });
    scope.append(pageButton, appButton);

    const selects = element("div", "ur-filter-selects");
    const status = filterSelect("Status", [
      ["active", "Active"],
      ["all", "All statuses"],
      ["open", "Open"],
      ["in_progress", "In progress"],
      ["review", "Ready for review"],
      ["resolved", "Resolved"],
    ], this.#statusFilter);
    status.addEventListener("change", () => {
      if (isStatusFilter(status.value)) {
        this.#statusFilter = status.value;
        this.#selectedIds.clear();
        this.#renderPanel();
      }
    });
    const agent = filterSelect("Agent", [
      ["all", "Any activity"],
      ["waiting", "Waiting for agent"],
      ["replied", "Agent replied"],
      ["ready", "Ready for review"],
    ], this.#agentFilter);
    agent.addEventListener("change", () => {
      if (isAgentFilter(agent.value)) {
        this.#agentFilter = agent.value;
        this.#selectedIds.clear();
        this.#renderPanel();
      }
    });
    selects.append(status.parentElement ?? status, agent.parentElement ?? agent);

    if (this.#reviewScope === "app") {
      const routes = [...new Set(this.#annotations.map((annotation) => annotation.pageUrl))].sort();
      const route = filterSelect(
        "Route",
        [["*", "All routes"], ...routes.map((pageUrl) => [pageUrl, pageUrl] as const)],
        this.#routeFilter,
      );
      route.addEventListener("change", () => {
        this.#routeFilter = route.value;
        this.#selectedIds.clear();
        this.#renderPanel();
      });
      selects.prepend(route.parentElement ?? route);
    }
    filters.append(scope, selects);
    return filters;
  }

  #filteredAnnotations(): readonly Annotation[] {
    const scoped = this.#reviewScope === "page" ? this.#currentPageAnnotations() : this.#annotations;
    return scoped
      .filter((annotation) => this.#routeFilter === "*" || annotation.pageUrl === this.#routeFilter)
      .filter((annotation) => {
        if (this.#statusFilter === "all") {
          return true;
        }
        if (this.#statusFilter === "active") {
          return annotation.status !== "resolved";
        }
        return annotation.status === this.#statusFilter;
      })
      .filter((annotation) => {
        const hasAgentReply = annotation.messages.some((message) => message.author === "agent");
        if (this.#agentFilter === "waiting") {
          return annotation.status === "open" && !hasAgentReply;
        }
        if (this.#agentFilter === "replied") {
          return hasAgentReply;
        }
        if (this.#agentFilter === "ready") {
          return annotation.status === "review";
        }
        return true;
      });
  }

  #annotationCard(annotation: Annotation, index: number): HTMLElement {
    const card = element("article", "ur-card");
    const top = element("div", "ur-card-top");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.#selectedIds.has(annotation.id);
    checkbox.disabled = annotation.status === "resolved";
    checkbox.setAttribute("aria-label", `Select annotation ${index + 1}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        this.#selectedIds.add(annotation.id);
      } else {
        this.#selectedIds.delete(annotation.id);
      }
      this.#renderPanel();
    });
    top.append(checkbox);
    top.append(element("span", "ur-card-index", String(index + 1)));
    top.append(element("code", "ur-target-label", targetLabel(annotation.target)));
    if (annotation.pageUrl === this.#currentPage && !targetAvailable(annotation.target)) {
      const missing = element("span", "ur-target-missing", "Target missing");
      missing.title = "The saved element is no longer available on this page";
      top.append(missing);
    }
    const status = element("span", "ur-status", statusLabels[annotation.status]);
    status.dataset.status = annotation.status;
    top.append(status);
    const openButton = element("button", "ur-card-open") as HTMLButtonElement;
    openButton.type = "button";
    openButton.dataset.annotationOpen = annotation.id;
    openButton.setAttribute("aria-label", `Open annotation ${index + 1}`);
    const firstMessage = annotation.messages[0];
    openButton.append(element("p", "ur-card-message", firstMessage?.text ?? ""));
    const meta = element("div", "ur-card-meta");
    const route = element("span", "ur-card-route", annotation.pageUrl);
    const details = element(
      "span",
      "",
      `${String(annotation.messages.length)} ${annotation.messages.length === 1 ? "message" : "messages"}`,
    );
    if ((annotation.screenshots?.length ?? 0) > 0) {
      details.prepend(iconElement(icons.camera), document.createTextNode(` ${String(annotation.screenshots?.length ?? 0)} · `));
    }
    meta.append(route, details);
    meta.append(element("time", "", formatTimestamp(annotation.updatedAt)));
    const chevron = element("span", "ur-card-chevron");
    chevron.innerHTML = icons.chevronRight;
    meta.append(chevron);
    openButton.append(meta);
    openButton.addEventListener("click", () => {
      this.#panelReturnAnnotationId = annotation.id;
      this.#selectedId = annotation.id;
      this.#renderPanel();
      window.requestAnimationFrame(() => this.#panelBack.focus());
    });
    const actions = element("div", "ur-card-actions");
    const locateButton = element("button", "ur-card-locate") as HTMLButtonElement;
    locateButton.type = "button";
    setButtonContent(
      locateButton,
      annotation.pageUrl === this.#currentPage ? icons.locate : icons.globe,
      annotation.pageUrl === this.#currentPage ? "Locate" : "Go to page",
    );
    locateButton.addEventListener("click", () => this.#focusAnnotationTarget(annotation));
    const resolveButton = element(
      "button",
      annotation.status === "resolved" ? "ur-card-resolve is-resolved" : "ur-card-resolve",
    ) as HTMLButtonElement;
    resolveButton.type = "button";
    setButtonContent(
      resolveButton,
      annotation.status === "resolved" ? icons.reopen : icons.check,
      annotation.status === "resolved" ? "Reopen" : "Resolve",
    );
    resolveButton.addEventListener("click", () => void this.#setAnnotationResolution(annotation));
    actions.append(locateButton, resolveButton);
    card.append(top, openButton, actions);
    return card;
  }

  async #resolveAnnotations(annotationIds: readonly string[]): Promise<void> {
    try {
      await Promise.all(annotationIds.map((annotationId) => this.#api.setStatus(annotationId, "resolved")));
      this.#selectedIds.clear();
      await this.#refresh();
      this.#showToast(`${annotationIds.length} ${annotationIds.length === 1 ? "annotation" : "annotations"} resolved`);
    } catch (error: unknown) {
      this.#showToast(errorMessage(error), "error");
    }
  }

  async #copyAnnotationsForAgent(annotations: readonly Annotation[]): Promise<void> {
    try {
      await copyText(formatAgentInstruction(annotations));
      const activeCount = annotations.filter((annotation) => annotation.status !== "resolved").length;
      this.#showToast(`${activeCount} active ${activeCount === 1 ? "annotation" : "annotations"} copied for agent`);
    } catch (error: unknown) {
      this.#showToast(errorMessage(error), "error");
    }
  }

  async #setAnnotationResolution(annotation: Annotation): Promise<void> {
    const nextStatus: AnnotationStatus = annotation.status === "resolved" ? "open" : "resolved";
    try {
      await this.#api.setStatus(annotation.id, nextStatus);
      this.#selectedIds.delete(annotation.id);
      await this.#refresh();
      this.#showToast(nextStatus === "resolved" ? "Annotation resolved" : "Annotation reopened");
    } catch (error: unknown) {
      this.#showToast(errorMessage(error), "error");
    }
  }

  #restorePanelFocus(): void {
    if (this.#panelReturnAnnotationId !== null) {
      const openButton = this.#root.querySelector<HTMLButtonElement>(`[data-annotation-open="${CSS.escape(this.#panelReturnAnnotationId)}"]`);
      if (openButton !== null) {
        openButton.focus();
        return;
      }
    }
    this.#commentsButton.focus();
  }

  #renderAnnotationDetail(annotation: Annotation): void {
    const filtered = this.#filteredAnnotations();
    const visibleAnnotations = filtered.some((item) => item.id === annotation.id)
      ? filtered
      : [...filtered, annotation];
    const index = visibleAnnotations.findIndex((item) => item.id === annotation.id);
    this.#panelBack.hidden = false;
    this.#panelTitle.textContent = index < 0 ? "Annotation" : `Annotation ${String(index + 1)}`;
    this.#panelSubtitle.textContent = `${statusLabels[annotation.status]} · ${annotation.pageUrl}`;
    const meta = element("div", "ur-detail-meta");
    meta.append(element("code", "", targetLabel(annotation.target)));
    meta.append(element("span", "", annotation.target.type === "element" ? annotation.target.domPath : regionDescription(annotation.target)));
    const targetActions = element("div", "ur-target-actions");
    const locateButton = element("button", "ur-secondary-action") as HTMLButtonElement;
    locateButton.type = "button";
    setButtonContent(
      locateButton,
      annotation.pageUrl === this.#currentPage ? icons.locate : icons.globe,
      annotation.pageUrl === this.#currentPage ? "Locate target" : "Go to page",
    );
    locateButton.addEventListener("click", () => this.#focusAnnotationTarget(annotation));
    const retargetButton = element("button", "ur-secondary-action") as HTMLButtonElement;
    retargetButton.type = "button";
    setButtonContent(retargetButton, icons.cursor, "Re-anchor");
    retargetButton.addEventListener("click", () => {
      this.#setInteraction({
        kind: "capturing",
        mode: annotation.target.type,
        retargetId: annotation.id,
      });
    });
    targetActions.append(locateButton, retargetButton);
    meta.append(targetActions);
    if (annotation.pageUrl === this.#currentPage && !targetAvailable(annotation.target)) {
      const warning = element("div", "ur-orphan-warning");
      warning.append(iconElement(icons.locate), element("span", "", "This target is no longer available. Re-anchor it to restore the pin."));
      meta.append(warning);
    }

    const screenshots = this.#screenshotGallery(annotation.screenshots ?? []);
    const thread = element("div", "ur-thread");
    for (const [messageIndex, message] of annotation.messages.entries()) {
      const wrapper = element("article", "ur-message");
      wrapper.dataset.author = message.author;
      const messageHeader = element("div", "ur-message-head");
      messageHeader.append(element("span", "ur-message-label", message.author === "agent" ? "Agent" : "You"));
      if (messageIndex === 0 && message.author === "user" && this.#editingCommentId !== annotation.id) {
        const editButton = element("button", "ur-message-action") as HTMLButtonElement;
        editButton.type = "button";
        editButton.setAttribute("aria-label", "Edit initial comment");
        editButton.innerHTML = icons.edit;
        editButton.addEventListener("click", () => {
          this.#editingCommentId = annotation.id;
          this.#renderPanel();
        });
        messageHeader.append(editButton);
      }
      wrapper.append(messageHeader);
      if (messageIndex === 0 && this.#editingCommentId === annotation.id) {
        wrapper.append(this.#commentEditor(annotation, message.text));
      } else {
        wrapper.append(element("div", "ur-message-bubble", message.text));
      }
      wrapper.append(element("time", "ur-message-time", formatTimestamp(message.createdAt)));
      thread.append(wrapper);
    }
    this.#panelBody.replaceChildren(
      meta,
      ...(screenshots === null ? [] : [screenshots]),
      thread,
    );
    window.requestAnimationFrame(() => {
      if (this.#editingCommentId === null) {
        this.#panelBody.scrollTop = this.#panelBody.scrollHeight;
      }
    });

    const replyForm = element("form", "ur-reply-form") as HTMLFormElement;
    const textarea = element("textarea", "") as HTMLTextAreaElement;
    textarea.placeholder = "Reply in this thread…";
    textarea.setAttribute("aria-label", "Reply in this thread");
    textarea.rows = 1;
    const sendButton = element("button", "ur-send-button") as HTMLButtonElement;
    sendButton.type = "submit";
    sendButton.disabled = true;
    sendButton.setAttribute("aria-label", "Send reply");
    sendButton.innerHTML = icons.arrowUp;
    textarea.addEventListener("input", () => {
      sendButton.disabled = textarea.value.trim().length === 0;
    });
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
    const deleteButton = element("button", "ur-delete-button") as HTMLButtonElement;
    deleteButton.type = "button";
    setButtonContent(deleteButton, icons.trash, "Delete");
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
    statusSelect.setAttribute("aria-label", "Annotation status");
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
    const resolveButton = element(
      "button",
      annotation.status === "resolved" ? "ur-resolve-button is-resolved" : "ur-resolve-button",
    ) as HTMLButtonElement;
    resolveButton.type = "button";
    setButtonContent(
      resolveButton,
      annotation.status === "resolved" ? icons.reopen : icons.check,
      annotation.status === "resolved" ? "Reopen" : "Resolve",
    );
    resolveButton.addEventListener("click", () => void this.#setAnnotationResolution(annotation));
    actions.append(deleteButton, resolveButton, statusSelect);
    this.#panelFooter.hidden = false;
    this.#panelFooter.replaceChildren(replyForm, actions);
  }

  #commentEditor(annotation: Annotation, value: string): HTMLElement {
    const editor = element("form", "ur-comment-editor") as HTMLFormElement;
    const textarea = element("textarea", "") as HTMLTextAreaElement;
    textarea.value = value;
    textarea.setAttribute("aria-label", "Edit initial comment");
    const actions = element("div", "ur-comment-editor-actions");
    const cancel = element("button", "ur-button ur-button-secondary") as HTMLButtonElement;
    cancel.type = "button";
    setButtonContent(cancel, icons.close, "Cancel");
    cancel.addEventListener("click", () => {
      this.#editingCommentId = null;
      this.#renderPanel();
    });
    const save = element("button", "ur-button ur-button-primary") as HTMLButtonElement;
    save.type = "submit";
    setButtonContent(save, icons.check, "Save");
    editor.addEventListener("submit", (event) => {
      event.preventDefault();
      const comment = textarea.value.trim();
      if (comment.length === 0) {
        return;
      }
      save.disabled = true;
      void this.#api.update(annotation.id, { comment })
        .then(async () => {
          this.#editingCommentId = null;
          await this.#refresh();
          this.#showToast("Comment updated");
        })
        .catch((error: unknown) => {
          save.disabled = false;
          this.#showToast(errorMessage(error), "error");
        });
    });
    actions.append(cancel, save);
    editor.append(textarea, actions);
    window.requestAnimationFrame(() => textarea.focus());
    return editor;
  }

  #screenshotGallery(screenshots: readonly ScreenshotAttachment[]): HTMLElement | null {
    if (screenshots.length === 0) {
      return null;
    }
    const section = element("section", "ur-screenshots");
    const title = element("div", "ur-section-title");
    title.append(iconElement(icons.camera), element("strong", "", "Screenshots"));
    const gallery = element("div", "ur-screenshot-grid");
    for (const screenshot of screenshots) {
      const link = document.createElement("a");
      link.className = "ur-screenshot-link";
      link.href = this.#api.screenshotUrl(screenshot.id);
      link.target = "_blank";
      link.rel = "noopener";
      link.setAttribute("aria-label", `Open screenshot ${screenshot.fileName}`);
      const image = document.createElement("img");
      image.src = link.href;
      image.alt = screenshot.fileName;
      image.loading = "lazy";
      link.append(image, element("span", "", `${screenshot.fileName} · ${String(screenshot.width)}×${String(screenshot.height)}`));
      gallery.append(link);
    }
    section.append(title, gallery);
    return section;
  }

  #focusAnnotationTarget(annotation: Annotation): void {
    if (annotation.pageUrl !== this.#currentPage) {
      const destination = sameOriginPageUrl(annotation.pageUrl);
      if (destination === null) {
        this.#showToast("This annotation has an invalid page URL", "error");
        return;
      }
      window.location.assign(destination);
      return;
    }
    if (annotation.target.type === "element") {
      const target = findTargetElement(annotation.target);
      if (target === null) {
        this.#showToast("Target is missing", "error", {
          icon: icons.cursor,
          label: "Re-anchor",
          onClick: () => {
            this.#setInteraction({ kind: "capturing", mode: "element", retargetId: annotation.id });
          },
        });
        return;
      }
      target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      window.setTimeout(() => this.#spotlightTarget(annotation.target, "Annotation target"), 180);
      return;
    }
    const top = annotation.target.boundingBox.y - window.innerHeight / 2;
    window.scrollTo({ behavior: prefersReducedMotion() ? "auto" : "smooth", top: Math.max(0, top) });
    window.setTimeout(() => this.#spotlightTarget(annotation.target, "Annotated area"), 180);
  }

  #spotlightTarget(target: AnnotationTarget, label: string): void {
    if (this.#spotlightTimer !== undefined) {
      window.clearTimeout(this.#spotlightTimer);
    }
    const bounds = targetBounds(target);
    if (bounds === null) {
      return;
    }
    Object.assign(this.#highlight.style, {
      height: `${bounds.height}px`,
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
    });
    this.#highlightLabel.textContent = label;
    this.#highlight.dataset.spotlight = "true";
    this.#highlight.hidden = false;
    this.#spotlightTimer = window.setTimeout(() => {
      this.#highlight.hidden = true;
      delete this.#highlight.dataset.spotlight;
      this.#spotlightTimer = undefined;
    }, 1_800);
  }

  async #retargetAnnotation(annotationId: string, target: AnnotationTarget): Promise<void> {
    try {
      await this.#api.update(annotationId, {
        pageTitle: document.title,
        pageUrl: this.#currentPage,
        target,
      });
      await this.#refresh();
      this.#selectedId = annotationId;
      this.#setInteraction({ kind: "reviewing" });
      this.#showToast("Target re-anchored");
    } catch (error: unknown) {
      this.#setInteraction({ kind: "idle" });
      this.#showToast(errorMessage(error), "error");
    }
  }

  #showPinPreview(annotationId: string, pin: HTMLButtonElement): void {
    if (this.#previewTimer !== undefined) {
      window.clearTimeout(this.#previewTimer);
      this.#previewTimer = undefined;
    }
    const annotation = this.#annotationById.get(annotationId);
    if (annotation === undefined) {
      return;
    }
    this.#previewMessage.textContent = annotation.messages[0]?.text ?? "";
    this.#previewMeta.textContent = `${statusLabels[annotation.status]} · ${String(annotation.messages.length)} ${annotation.messages.length === 1 ? "message" : "messages"}`;
    this.#preview.dataset.status = annotation.status;
    this.#preview.hidden = false;
    const pinBounds = pin.getBoundingClientRect();
    const previewBounds = this.#preview.getBoundingClientRect();
    const left = Math.min(
      Math.max(12, pinBounds.left - previewBounds.width / 2),
      window.innerWidth - previewBounds.width - 12,
    );
    const top = Math.max(12, pinBounds.top - previewBounds.height - 16);
    Object.assign(this.#preview.style, { left: `${left}px`, top: `${top}px` });
  }

  #hidePinPreview(): void {
    if (this.#previewTimer !== undefined) {
      window.clearTimeout(this.#previewTimer);
    }
    this.#previewTimer = window.setTimeout(() => {
      this.#preview.hidden = true;
      this.#previewTimer = undefined;
    }, 100);
  }

  #showToast(
    message: string,
    kind: "error" | "success" = "success",
    action?: { readonly icon: string; readonly label: string; readonly onClick: () => void },
  ): void {
    if (this.#toastTimer !== undefined) {
      window.clearTimeout(this.#toastTimer);
    }
    const text = element("span", "", message);
    if (action === undefined) {
      this.#toast.replaceChildren(text);
    } else {
      const button = element("button", "ur-toast-action") as HTMLButtonElement;
      button.type = "button";
      setButtonContent(button, action.icon, action.label);
      button.addEventListener("click", () => {
        this.#toast.hidden = true;
        action.onClick();
      });
      this.#toast.replaceChildren(text, button);
    }
    this.#toast.dataset.kind = kind;
    this.#toast.hidden = false;
    this.#toastTimer = window.setTimeout(() => {
      this.#toast.hidden = true;
      this.#toastTimer = undefined;
    }, action === undefined ? 2_600 : 5_000);
  }
}

function markup(nonce: string): string {
  const nonceAttribute = nonce.length === 0 ? "" : ` nonce="${nonce}"`;
  return `
    <style${nonceAttribute}>${overlayStyles}</style>
    <div class="ur-pin-layer" data-ur="pins"></div>
    <div class="ur-pin-preview" data-ur="preview" role="tooltip" hidden><span class="ur-preview-meta" data-ur="preview-meta"></span><p data-ur="preview-message"></p><span class="ur-preview-hint">Click to open thread</span></div>
    <div class="ur-highlight" data-ur="highlight" hidden><span class="ur-highlight-label" data-ur="highlight-label"></span></div>
    <div class="ur-mode-banner" data-ur="mode-banner" role="status" hidden><strong data-ur="mode-text"></strong><span>Esc to cancel</span></div>
    <div class="ur-region-capture" data-ur="region-capture" hidden><div class="ur-region-draft" data-ur="region-draft" hidden></div></div>
    <aside class="ur-panel" data-ur="panel" aria-label="UI Review comments" hidden>
      <header class="ur-panel-header">
        <button class="ur-icon-button" data-ur="panel-back" type="button" aria-label="Back">${icons.arrowLeft}</button>
        <div class="ur-panel-heading"><h2 class="ur-panel-title" data-ur="panel-title"></h2><p class="ur-panel-subtitle" data-ur="panel-subtitle"></p></div>
        <div class="ur-panel-header-actions">
          <button class="ur-icon-button" data-ur="panel-copy" type="button" aria-label="Copy active annotations for agent">${icons.copy}</button>
          <button class="ur-icon-button" data-ur="panel-close" type="button" aria-label="Close comments">${icons.close}</button>
        </div>
      </header>
      <div class="ur-panel-body" data-ur="panel-body"></div>
      <footer class="ur-panel-footer" data-ur="panel-footer" hidden></footer>
    </aside>
    <div class="ur-modal-backdrop" data-ur="modal" hidden>
      <form class="ur-composer" data-ur="composer-form" role="dialog" aria-modal="true" aria-labelledby="ur-composer-title" aria-describedby="ur-composer-hint">
        <header class="ur-composer-head"><span class="ur-composer-icon">${icons.comments}</span><div><strong id="ur-composer-title">Leave feedback</strong><span class="ur-composer-target" data-ur="composer-target"></span></div></header>
        <div class="ur-composer-body">
          <textarea data-ur="composer-text" aria-label="Feedback comment" placeholder="What should change, and what result do you want?" maxlength="20000" required></textarea>
          <div class="ur-screenshot-tools">
            <input data-ur="screenshot-input" type="file" accept="image/png,image/jpeg,image/webp" hidden>
            <button class="ur-attach-button" data-ur="screenshot-choose" type="button">${icons.camera}<span>Attach screenshot</span></button>
            <span>or paste an image</span>
          </div>
          <div class="ur-screenshot-preview" data-ur="screenshot-preview" hidden>
            <img data-ur="screenshot-image" alt="">
            <span data-ur="screenshot-name"></span>
            <button class="ur-icon-button" data-ur="screenshot-remove" type="button" aria-label="Remove screenshot">${icons.close}</button>
          </div>
          <p class="ur-composer-hint" id="ur-composer-hint">The target, styles, position, page context, and optional screenshot are attached automatically.</p>
        </div>
        <footer class="ur-composer-actions"><button class="ur-button ur-button-secondary" data-ur="composer-cancel" type="button">${icons.close}<span>Cancel</span></button><button class="ur-button ur-button-primary" data-ur="composer-submit" type="submit" disabled>${icons.check}<span>Add comment</span></button></footer>
      </form>
    </div>
    <div class="ur-toast" data-ur="toast" role="status" aria-live="polite" aria-atomic="true" hidden></div>
    <div class="ur-toolbar" data-expanded="false" data-ur="toolbar" role="toolbar" aria-label="UI Review">
      <button class="ur-brand" data-ur="brand" type="button" aria-label="Toggle UI Review">${icons.spark}</button>
      <div class="ur-actions">
        <button class="ur-tool-button" data-active="false" data-ur="element" type="button" aria-label="Select element">${icons.cursor}<span class="ur-tool-label">Element</span></button>
        <button class="ur-tool-button" data-active="false" data-ur="region" type="button" aria-label="Draw area">${icons.region}<span class="ur-tool-label">Area</span></button>
        <span class="ur-divider"></span>
        <button class="ur-tool-button" data-active="false" data-ur="comments" type="button" aria-label="Review comments">${icons.comments}<span class="ur-tool-label">Comments</span><span class="ur-count" data-ur="count" hidden></span></button>
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

function iconElement(icon: string): HTMLSpanElement {
  const value = document.createElement("span");
  value.className = "ur-inline-icon";
  value.innerHTML = icon;
  return value;
}

function setButtonContent(button: HTMLButtonElement, icon: string, label: string): void {
  const text = document.createElement("span");
  text.textContent = label;
  button.replaceChildren(iconElement(icon), text);
}

function filterSelect(
  labelText: string,
  options: readonly (readonly [value: string, label: string])[],
  selectedValue: string,
): HTMLSelectElement {
  const label = element("label", "ur-filter-select");
  label.append(element("span", "", labelText));
  const select = document.createElement("select");
  select.setAttribute("aria-label", labelText);
  for (const [value, text] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.selected = value === selectedValue;
    select.append(option);
  }
  label.append(select);
  return select;
}

function isStatusFilter(value: string): value is StatusFilter {
  return value === "active" || value === "all" || isAnnotationStatus(value);
}

function isAgentFilter(value: string): value is AgentFilter {
  return value === "all" || value === "replied" || value === "ready" || value === "waiting";
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
    const element = findTargetElement(target);
    if (element !== null) {
      const bounds = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (bounds.width <= 0 || bounds.height <= 0 || style.display === "none" || style.visibility === "hidden") {
        return { visible: false, x: 0, y: 0 };
      }
      x = bounds.right + 10;
      y = bounds.top + 8;
    } else {
      return { visible: false, x: 0, y: 0 };
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

function findTargetElement(target: Extract<AnnotationTarget, { readonly type: "element" }>): Element | null {
  try {
    return document.querySelector(target.selector);
  } catch {
    return null;
  }
}

function targetAvailable(target: AnnotationTarget): boolean {
  return target.type === "region" || findTargetElement(target) !== null;
}

function targetBounds(target: AnnotationTarget): {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
} | null {
  if (target.type === "element") {
    const element = findTargetElement(target);
    if (element === null) {
      return null;
    }
    const bounds = element.getBoundingClientRect();
    return { height: bounds.height, left: bounds.left, top: bounds.top, width: bounds.width };
  }
  return {
    height: target.boundingBox.height,
    left: target.boundingBox.x - window.scrollX,
    top: target.boundingBox.y - window.scrollY,
    width: target.boundingBox.width,
  };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sameOriginPageUrl(pageUrl: string): string | null {
  try {
    const destination = new URL(pageUrl, window.location.origin);
    return destination.origin === window.location.origin
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : null;
  } catch {
    return null;
  }
}

async function imageDimensions(source: string): Promise<{ readonly height: number; readonly width: number }> {
  const image = new Image();
  const dimensions = await new Promise<{ readonly height: number; readonly width: number }>((resolve, reject) => {
    image.addEventListener("load", () => {
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    }, { once: true });
    image.addEventListener("error", () => reject(new Error("Screenshot could not be decoded")), { once: true });
    image.src = source;
  });
  if (dimensions.height <= 0 || dimensions.width <= 0) {
    throw new Error("Screenshot dimensions are invalid");
  }
  return dimensions;
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected UI Review error";
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy path for browsers without clipboard permission.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.left = "-9999px";
  textarea.style.position = "fixed";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("The browser could not copy the annotations");
  }
}

if (!document.querySelector("[data-ui-review-root]")) {
  const reviewScript = document.querySelector<HTMLScriptElement>("script[data-ui-review-app][src^='/__ui_review/browser.js']");
  const appId = reviewScript?.dataset.uiReviewApp;
  if (appId === undefined || appId.length === 0) {
    throw new Error("UI Review app identity is missing from the injected browser script");
  }
  const includeHash = reviewScript?.dataset.uiReviewIncludeHash === "true";
  const nonce = reviewScript?.nonce ?? "";
  const host = document.createElement("div");
  host.dataset.uiReviewRoot = "";
  document.body.append(host);
  const overlay = new ReviewOverlay(host, appId, includeHash, nonce);
  void overlay.start();
}
