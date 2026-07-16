import { describe, expect, it } from "vitest";
import { addReviewNonce } from "./upstream-proxy.js";

describe("addReviewNonce", () => {
  it("adds a nonce to existing script and style directives", () => {
    expect(addReviewNonce("default-src 'self'; script-src 'nonce-approved'; style-src 'self'; connect-src https://api.example", "review"))
      .toBe("default-src 'self'; script-src 'nonce-approved' 'nonce-review'; style-src 'self' 'nonce-review'; connect-src https://api.example 'self'");
  });

  it("adds explicit script, style, and connection policies when only default-src exists", () => {
    expect(addReviewNonce("default-src 'none'", "review"))
      .toBe("default-src 'none'; script-src 'self' 'nonce-review'; style-src 'self' 'nonce-review'; connect-src 'self'");
  });
});
