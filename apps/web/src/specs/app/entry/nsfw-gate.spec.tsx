import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { needsNsfwGate } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-nsfw-gate";
import { Entry } from "@/entities";

/**
 * #1538: the NSFW click-to-reveal gate is a client component. Any server subtree
 * passed through it as children has its element props serialized into the RSC
 * payload, which shipped the rendered article (dangerouslySetInnerHTML, ~11 KB)
 * to the client on EVERY post — though nothing client-side reads it.
 *
 * The fix is to decide on the server whether the gate is needed and mount it
 * only for NSFW posts. These tests pin (a) the predicate, unchanged from the
 * gate's own literal-tag check, and (b) that the server tree really does skip
 * the client wrapper for a non-NSFW post and keep it for an NSFW one.
 */

// The gate is the ONLY thing being observed. Everything else in the SSR tree
// is stubbed to a marker so the assertion is about tree shape, not content.
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-nsfw-body-wrapper", () => ({
  EntryPageNsfwBodyWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="nsfw-gate">{children}</div>
  )
}));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-static-body", () => ({
  EntryPageStaticBody: () => <div id="post-body">STATIC_BODY</div>
}));
for (const stub of [
  "entry-footer-controls|EntryFooterControls",
  "entry-footer-info|EntryFooterInfo",
  "entry-page-is-comment-header|EntryPageIsCommentHeader",
  "entry-page-main-info|EntryPageMainInfo",
  "entry-page-warnings|EntryPageWarnings",
  "entry-tags|EntryTags"
]) {
  const [file, name] = stub.split("|");
  vi.doMock(`@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/${file}`, () => ({
    [name]: () => null
  }));
}
vi.mock("@/features/shared/entry-translate/entry-translate-inline", () => ({
  EntryTranslateInline: () => null
}));
vi.mock("@/features/polls", () => ({
  PollWidget: () => null,
  useEntryPollExtractor: () => null
}));
vi.mock("@/utils", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useEntryLocation: () => null
}));

const entry = (tags: string[]): Entry =>
  ({
    author: "alice",
    permlink: "p",
    body: "hello",
    json_metadata: { tags },
    category: "test"
  }) as unknown as Entry;

describe("needsNsfwGate — the literal-tag predicate the gate always used", () => {
  it("true only for the literal nsfw tag", () => {
    expect(needsNsfwGate(entry(["nsfw"]))).toBe(true);
    expect(needsNsfwGate(entry(["photography", "nsfw", "art"]))).toBe(true);
  });

  it("false for no tags, other tags, or missing metadata", () => {
    expect(needsNsfwGate(entry([]))).toBe(false);
    expect(needsNsfwGate(entry(["photography"]))).toBe(false);
    expect(needsNsfwGate({ json_metadata: undefined } as unknown as Entry)).toBe(false);
    expect(needsNsfwGate({ json_metadata: { tags: undefined } } as unknown as Entry)).toBe(false);
  });

  it("does NOT widen to community/title heuristics (that is isNsfwEntry, a separate decision)", () => {
    // A DPorn-community post with no nsfw tag is NOT gated by this predicate —
    // exactly as before. Widening it is #1538's explicitly deferred question.
    const dporn = { ...entry(["photo"]), category: "hive-109634" } as Entry;
    expect(needsNsfwGate(dporn)).toBe(false);
  });
});

describe("EntryPageContentSSR mounts the client gate only when needed (#1538)", () => {
  async function render(tags: string[]) {
    const { EntryPageContentSSR } = await import(
      "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-content-ssr"
    );
    return renderToStaticMarkup(<EntryPageContentSSR entry={entry(tags)} />);
  }

  it("non-NSFW post: static body is rendered with NO client gate around it", async () => {
    const html = await render(["photography"]);
    expect(html).toContain("STATIC_BODY");
    expect(html).not.toContain('data-testid="nsfw-gate"');
  });

  it("NSFW post: static body is still wrapped in the client gate (behaviour preserved)", async () => {
    const html = await render(["nsfw"]);
    expect(html).toContain('data-testid="nsfw-gate"');
    expect(html).toContain("STATIC_BODY");
    // and the body sits INSIDE the gate, not beside it
    expect(html.indexOf('data-testid="nsfw-gate"')).toBeLessThan(html.indexOf("STATIC_BODY"));
  });
});
