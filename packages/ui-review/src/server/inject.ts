/** Inject the isolated browser client into an HTML document once. */
export function injectReviewClient(html: string, appId: string): string {
  if (html.includes("/__ui_review/browser.js")) {
    return html;
  }

  const browserScript = `<script type="module" src="/__ui_review/browser.js" data-ui-review-app="${escapeAttribute(appId)}"></script>`;
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
