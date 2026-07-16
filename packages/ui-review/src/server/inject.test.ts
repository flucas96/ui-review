import { describe, expect, it } from "vitest";
import { injectReviewClient } from "./inject.js";

describe("injectReviewClient", () => {
  it("injects the browser module before the closing body", () => {
    const output = injectReviewClient("<!doctype html><body><main>Hello</main></body>", {
      appId: "dashboard",
      includeHash: false,
    });

    expect(output).toBe(
      '<!doctype html><body><main>Hello</main><script type="module" src="/__ui_review/browser.js" data-ui-review-app="dashboard" data-ui-review-include-hash="false"></script></body>',
    );
  });

  it("escapes the application identity", () => {
    const output = injectReviewClient("<body></body>", {
      appId: 'team & "site"',
      includeHash: true,
      nonce: 'safe&"nonce',
    });

    expect(output).toContain('data-ui-review-app="team &amp; &quot;site&quot;"');
    expect(output).toContain('data-ui-review-include-hash="true"');
    expect(output).toContain('nonce="safe&amp;&quot;nonce"');
  });

  it("does not inject the browser module twice", () => {
    const once = injectReviewClient("<html></html>", { appId: "first", includeHash: false });

    expect(injectReviewClient(once, { appId: "second", includeHash: false })).toBe(once);
  });
});
