import { hasDraftableContent } from "@/app/publish/_utils/content";
import { describe, expect, it } from "vitest";

// Regression for the "save draft button is decoration" report: the publish
// action bar disabled Save draft unless a title had been typed, and the
// gray-link button appearance carried no disabled styling, so a body-first
// writer saw an ordinary-looking button that silently did nothing.
describe("hasDraftableContent", () => {
  it("offers a save for a body with no title yet", () => {
    expect(hasDraftableContent("", "<p>had written something to follow that up</p>")).toBe(true);
    expect(hasDraftableContent(undefined, "<p>a body</p>")).toBe(true);
  });

  it("offers a save for a title with no body yet", () => {
    expect(hasDraftableContent("Error 404: Title Not Found", "")).toBe(true);
  });

  it("offers a save for a body that is only an image", () => {
    expect(hasDraftableContent("", '<p><img src="https://i.ecency.com/a.jpg" /></p>')).toBe(true);
  });

  it("withholds a save for an untouched editor", () => {
    expect(hasDraftableContent("", "")).toBe(false);
    expect(hasDraftableContent(undefined, undefined)).toBe(false);
    // TipTap seeds an empty document with a bare paragraph.
    expect(hasDraftableContent("", "<p></p>")).toBe(false);
    expect(hasDraftableContent("   ", "<p>&nbsp;</p>")).toBe(false);
  });
});
