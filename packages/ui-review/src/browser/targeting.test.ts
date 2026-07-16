import { describe, expect, it } from "vitest";
import { currentPageUrl } from "./targeting.js";

describe("currentPageUrl", () => {
  it("ignores ordinary document anchors by default", () => {
    expect(currentPageUrl({
      hash: "#members",
      pathname: "/settings",
      search: "?tab=team",
    })).toBe("/settings?tab=team");
  });

  it("keeps hash routes independent when enabled", () => {
    expect(currentPageUrl({
      hash: "#/members",
      pathname: "/",
      search: "",
    }, true)).toBe("/#/members");
  });
});
