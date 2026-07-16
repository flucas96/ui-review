export type ReviewClientInjection = {
  readonly appId: string;
  readonly includeHash: boolean;
  readonly nonce?: string;
};

/** Inject the isolated browser client into an HTML document once. */
export function injectReviewClient(html: string, injection: ReviewClientInjection): string {
  if (html.includes("/__ui_review/browser.js")) {
    return html;
  }

  const nonceAttribute = injection.nonce === undefined ? "" : ` nonce="${escapeAttribute(injection.nonce)}"`;
  const browserScript = `<script type="module" src="/__ui_review/browser.js" data-ui-review-app="${escapeAttribute(injection.appId)}" data-ui-review-include-hash="${String(injection.includeHash)}"${nonceAttribute}></script>`;
  const bodyClose = html.toLowerCase().lastIndexOf("</body>");
  if (bodyClose >= 0) {
    return `${html.slice(0, bodyClose)}${browserScript}${html.slice(bodyClose)}`;
  }

  return `${html}${browserScript}`;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
