// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { annotateLanguageHints, detectionSample, hintFor, isServerRuntime, mergePreservingHint } from "@/core/entries/language-hint";
import { withSlimEntries } from "@/core/entries/slim-entry";
import { mockEntry } from "@/specs/test-utils";
import type { Entry } from "@/entities";

const SPANISH =
  "Hoy quiero compartir con ustedes una historia sobre la comunidad y el trabajo que hacemos juntos cada semana en la ciudad.";
const ENGLISH =
  "Today I want to share with you a story about the community and the work we do together every week in the city.";

function row(body: string, overrides: Partial<Entry> = {}): Entry {
  return mockEntry({ permlink: `hint-${Math.random().toString(36).slice(2)}`, body, ...overrides });
}

describe("server-side language hint (#1597)", () => {
  it("runs on the server in this environment", () => {
    expect(isServerRuntime()).toBe(true);
  });

  it("detects the summary language of slim rows and ships it as slim.lang", async () => {
    const options = withSlimEntries({
      queryKey: ["hint"],
      queryFn: async () => [row(SPANISH), row(ENGLISH)]
    });
    const page = (await (options.queryFn as () => Promise<Entry[]>)()) as Entry[];
    expect(page[0].body).toBe("");
    expect(page[0].slim?.lang).toBe("es");
    expect(page[1].slim?.lang).toBe("en");
  });

  it("marks a row whose summary is too short as checked with nothing to offer (null)", async () => {
    const options = withSlimEntries({ queryKey: ["hint"], queryFn: async () => [row("Hola.")] });
    const page = (await (options.queryFn as () => Promise<Entry[]>)()) as Entry[];
    expect(page[0].slim?.lang).toBeNull();
  });

  it("reaches the nested original of a cross-post", async () => {
    const original = row(SPANISH);
    const options = withSlimEntries({
      queryKey: ["hint"],
      queryFn: async () => [row(ENGLISH, { original_entry: original } as Partial<Entry>)]
    });
    const page = (await (options.queryFn as () => Promise<Entry[]>)()) as Entry[];
    expect(page[0].original_entry?.slim?.lang).toBe("es");
  });

  it("leaves rows without the slim marker and non-array pages alone", async () => {
    const full = row(ENGLISH);
    full.body = ""; // looks slim but never went through slimEntry
    expect((await annotateLanguageHints([full]))[0].slim).toBeUndefined();
    expect(await annotateLanguageHints({ items: [] })).toEqual({ items: [] });
    expect(await annotateLanguageHints(undefined)).toBeUndefined();
  });

  it("treats a missing or non-string description as no text", () => {
    const franc = vi.fn(() => "eng");
    for (const description of [undefined, null, 42, { text: ENGLISH }, [ENGLISH]]) {
      expect(hintFor(franc, { body: "", json_metadata: { description } as never })).toBeNull();
    }
    expect(franc).not.toHaveBeenCalled();
  });

  it("never throws out of the queryFn when the detector fails", () => {
    const boom = () => {
      throw new Error("boom");
    };
    expect(hintFor(boom, { body: "", json_metadata: { description: ENGLISH } })).toBeNull();
  });

  it("does not second-guess a row that already carries a hint", async () => {
    const slim = { ...row(ENGLISH), body: "", slim: { ext_link: false, lang: "de" as string | null } };
    slim.json_metadata = { description: ENGLISH };
    const [out] = await annotateLanguageHints([slim]);
    expect(out.slim?.lang).toBe("de");
  });

  it("treats an author description that is only a link or markup as no text (#1597 review)", () => {
    const franc = vi.fn(() => "por");
    for (const description of [
      "![photo](https://images.ecency.com/DQmabcdefghijklmnopqrstuvwxyz/photo_2026_08_21.jpg)",
      "https://3speak.tv/watch?v=someone/abcdefgh https://images.ecency.com/p/abcdefghijklmnop.png",
      "<center><img src='https://images.ecency.com/DQmabcdefghijklmnopqrstuvwxyz/x.png'></center>",
      "[Source](https://www.example.com/some/long/path/that/keeps/going/and/going/x)"
    ]) {
      expect(hintFor(franc, { body: "", json_metadata: { description } })).toBeNull();
    }
    expect(franc).not.toHaveBeenCalled();
    // Plain summaries are passed through unchanged, so the server and the
    // client decide on the same text.
    expect(detectionSample(ENGLISH)).toBe(ENGLISH);
  });

  it("keeps the server hint when a browser-polled row is merged over a cached one", () => {
    const cached = { ...row(ENGLISH), body: "", slim: { ext_link: false, lang: "en" as string | null } };
    const polled = { ...cached, slim: { ext_link: true }, stats: { total_votes: 9 } } as Entry;
    const merged = mergePreservingHint(cached, polled);
    expect(merged.slim).toEqual({ ext_link: true, lang: "en" });
    expect(merged.stats?.total_votes).toBe(9);
    // A row the server did check wins over the cached answer.
    const rechecked = { ...polled, slim: { ext_link: true, lang: "de" as string | null } };
    expect(mergePreservingHint(cached, rechecked).slim?.lang).toBe("de");
    // Nothing to preserve: plain merge.
    const unhinted = { ...cached, slim: { ext_link: false } } as Entry;
    expect(mergePreservingHint(unhinted, polled).slim).toEqual({ ext_link: true });
    // A cross-post's nested original keeps its hint too.
    const original = { ...row(SPANISH), body: "", slim: { ext_link: false, lang: "es" as string | null } };
    const crossCached = { ...cached, original_entry: original } as Entry;
    const crossPolled = {
      ...polled,
      original_entry: { ...original, slim: { ext_link: false }, stats: { total_votes: 3 } }
    } as Entry;
    const crossMerged = mergePreservingHint(crossCached, crossPolled);
    expect(crossMerged.original_entry?.slim).toEqual({ ext_link: false, lang: "es" });
    expect(crossMerged.original_entry?.stats?.total_votes).toBe(3);
  });

  it("leaves the post page's full bodies to the client (hints are for slim rows)", () => {
    const franc = vi.fn(() => "spa");
    expect(hintFor(franc, { body: SPANISH, json_metadata: { description: SPANISH } })).toBeNull();
    expect(franc).not.toHaveBeenCalled();
  });
});
