import { describe, expect, it } from "vitest";
import { injectReviewClient } from "./inject.js";

describe("injectReviewClient", () => {
  it("injects the browser module before the closing body", () => {
    const output = injectReviewClient("<!doctype html><body><main>Hello</main></body>", "dashboard");

    expect(output).toBe(
      '<!doctype html><body><main>Hello</main><script type="module" src="/__ui_review/browser.js" data-ui-review-app="dashboard"></script></body>',
    );
  });

  it("escapes the application identity", () => {
    const output = injectReviewClient("<body></body>", 'team & "site"');

    expect(output).toContain('data-ui-review-app="team &amp; &quot;site&quot;"');
  });

  it("does not inject the browser module twice", () => {
    const once = injectReviewClient("<html></html>", "first");

    expect(injectReviewClient(once, "second")).toBe(once);
  });
});
