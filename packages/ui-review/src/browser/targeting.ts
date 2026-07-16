import type { ElementTarget, Viewport } from "../shared/types.js";

const styleProperties = [
  "align-items",
  "background-color",
  "border",
  "border-radius",
  "box-shadow",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-weight",
  "gap",
  "height",
  "justify-content",
  "line-height",
  "margin",
  "opacity",
  "padding",
  "position",
  "text-align",
  "width",
] as const;

const preferredAttributes = ["data-testid", "data-test", "data-cy"] as const;

/** Return a route-stable page identifier without the review proxy origin. */
export function currentPageUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** Capture the current viewport and document scroll state. */
export function captureViewport(): Viewport {
  return {
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    width: window.innerWidth,
  };
}

/** Convert a DOM element into structured context a coding agent can locate. */
export function captureElementTarget(element: Element): ElementTarget {
  const bounds = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);
  const computedStyles = Object.fromEntries(
    styleProperties.map((property) => [property, computedStyle.getPropertyValue(property)]),
  );

  return {
    accessibility: accessibilityContext(element),
    boundingBox: {
      height: bounds.height,
      width: bounds.width,
      x: bounds.x + window.scrollX,
      y: bounds.y + window.scrollY,
    },
    computedStyles,
    domPath: domPath(element),
    nearbyText: nearbyText(element),
    selector: uniqueSelector(element),
    tagName: element.tagName.toLowerCase(),
    type: "element",
    viewport: captureViewport(),
  };
}

/** Build a compact selector that favors stable IDs and testing attributes. */
export function uniqueSelector(element: Element): string {
  if (element.id.length > 0) {
    const idSelector = `#${CSS.escape(element.id)}`;
    if (isUnique(idSelector)) {
      return idSelector;
    }
  }

  for (const attribute of preferredAttributes) {
    const value = element.getAttribute(attribute);
    if (value !== null && value.length > 0) {
      const attributeSelector = `[${attribute}="${CSS.escape(value)}"]`;
      if (isUnique(attributeSelector)) {
        return attributeSelector;
      }
    }
  }

  const segments: string[] = [];
  let current: Element | null = element;
  while (current !== null && current !== document.documentElement) {
    segments.unshift(selectorSegment(current));
    const selector = segments.join(" > ");
    if (isUnique(selector)) {
      return selector;
    }
    current = current.parentElement;
  }
  return segments.join(" > ") || element.tagName.toLowerCase();
}

function selectorSegment(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const stableClasses = [...element.classList]
    .filter((className) => className.length > 0 && className.length < 64)
    .filter((className) => /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(className))
    .slice(0, 2);
  const classSelector = stableClasses.map((className) => `.${CSS.escape(className)}`).join("");
  const baseSelector = `${tagName}${classSelector}`;
  const siblings = element.parentElement === null
    ? []
    : [...element.parentElement.children].filter((sibling) => sibling.tagName === element.tagName);
  const siblingIndex = siblings.indexOf(element);
  return siblings.length > 1 && siblingIndex >= 0
    ? `${baseSelector}:nth-of-type(${siblingIndex + 1})`
    : baseSelector;
}

function isUnique(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function domPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current !== null && segments.length < 8) {
    const tagName = current.tagName.toLowerCase();
    if (current.id.length > 0) {
      segments.unshift(`${tagName}#${current.id}`);
      break;
    }
    const parentElement: Element | null = current.parentElement;
    if (parentElement === null) {
      segments.unshift(tagName);
      break;
    }
    const currentTagName = current.tagName;
    const sameTagSiblings = [...parentElement.children].filter((child) => child.tagName === currentTagName);
    const index = sameTagSiblings.indexOf(current);
    segments.unshift(sameTagSiblings.length > 1 ? `${tagName}:nth-of-type(${index + 1})` : tagName);
    current = parentElement;
  }
  return segments.join(" > ");
}

function nearbyText(element: Element): string {
  const ownText = normalizeText(element.textContent ?? "");
  if (ownText.length > 0) {
    return ownText.slice(0, 1_000);
  }
  return normalizeText(element.parentElement?.textContent ?? "").slice(0, 1_000);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function accessibilityContext(element: Element): Readonly<Record<string, string>> {
  const entries = [
    ["role", element.getAttribute("role")],
    ["aria-label", element.getAttribute("aria-label")],
    ["aria-describedby", element.getAttribute("aria-describedby")],
    ["aria-expanded", element.getAttribute("aria-expanded")],
    ["alt", element.getAttribute("alt")],
    ["title", element.getAttribute("title")],
    ["href", element.getAttribute("href")],
    ["disabled", element.hasAttribute("disabled") ? "true" : null],
  ] as const;

  const context: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (value !== null) {
      context[key] = value;
    }
  }
  return context;
}
