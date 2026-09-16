import { describe, expect, it } from "vitest";
import { postBodySummary } from "@ecency/render-helper";
import { descriptionToEdit } from "@/app/submit/_utils/description";

const BODY = "Let me tell you a story about O.\n\nO is short for Orchestrator.";

// Regression: the classic editor published the description a draft or post was saved with,
// however far the body had been rewritten since.
describe("descriptionToEdit", () => {
  it("empties a description that is the body's own summary", () => {
    expect(descriptionToEdit(postBodySummary(BODY, 350), BODY)).toBe("");
  });

  it("empties the shorter form a draft or post stores", () => {
    expect(descriptionToEdit(postBodySummary(postBodySummary(BODY), 200), BODY)).toBe("");
  });

  it("keeps a description the author wrote", () => {
    expect(descriptionToEdit("My own summary", BODY)).toBe("My own summary");
  });

  it("keeps the summary of another body, which the author may have meant", () => {
    const other = postBodySummary("A different post about something else entirely.", 350);
    expect(descriptionToEdit(other, BODY)).toBe(other);
  });

  it("handles a missing description", () => {
    expect(descriptionToEdit(null, BODY)).toBe("");
    expect(descriptionToEdit(undefined, BODY)).toBe("");
  });
});
