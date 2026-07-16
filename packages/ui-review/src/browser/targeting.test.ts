import { describe, expect, it } from "vitest";
import { currentPageUrl } from "./targeting.js";

describe("currentPageUrl", () => {
  it("keeps React routes, query parameters, and hash routes independent", () => {
    expect(currentPageUrl({
      hash: "#members",
      pathname: "/settings",
      search: "?tab=team",
    })).toBe("/settings?tab=team#members");
  });
});
