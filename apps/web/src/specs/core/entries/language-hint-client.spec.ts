import { describe, expect, it } from "vitest";
import { annotateLanguageHints, isServerRuntime } from "@/core/entries/language-hint";
import { mockEntry } from "@/specs/test-utils";
import type { Entry } from "@/entities";

// jsdom: the browser path. Rows the browser fetches itself must stay without a
// hint so the gate keeps detecting on idle, and the detector must not load.
describe("language hint in the browser (#1597)", () => {
  it("is a no-op on the client", async () => {
    expect(isServerRuntime()).toBe(false);
    const slim = {
      ...mockEntry({ permlink: "client-row", body: "" }),
      slim: { ext_link: false }
    } as Entry;
    slim.json_metadata = {
      description:
        "Today I want to share with you a story about the community and the work we do together every week."
    };
    const [out] = await annotateLanguageHints([slim]);
    expect(out.slim?.lang).toBeUndefined();
  });
});
