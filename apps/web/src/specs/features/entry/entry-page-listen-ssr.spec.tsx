import { vi, describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import type { ReactNode } from "react";

/*
  SSR pin for #1662: the word count and read time are pure derivations of
  entry.body and must be present in the server-rendered HTML, not "0"
  placeholders that flip after hydration. renderToString runs no effects,
  exactly like the server, so a regression back to useMount renders 0 here.

  The collaborators are mocked at their module seams; the component itself,
  countWords and the real getPurePostTextForWordCount run for real.
*/
vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  getAccessToken: vi.fn(() => undefined),
  ensureValidToken: vi.fn()
}));
vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/features/text-to-speech", () => ({
  useTts: vi.fn(() => ({ speechRef: { current: undefined }, hasPaused: false, hasStarted: false })),
  TextToSpeechSettingsDialog: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("@/api/translation", () => ({
  getTranslation: vi.fn(),
  getLanguages: vi.fn(async () => [])
}));
vi.mock("@/config", () => ({
  EcencyConfigManager: { useConfig: vi.fn(() => false) }
}));
vi.mock("@ui/modal", () => ({
  Modal: () => null,
  ModalBody: () => null,
  ModalHeader: () => null,
  ModalTitle: () => null
}));

import { EntryPageListen, countWords } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-listen";
import type { Entry } from "@/entities";

describe("EntryPageListen SSR output (#1662)", () => {
  const body = Array.from({ length: 574 }, (_, i) => `word${i}`).join(" ");
  const entry = { body } as Entry;

  it("computes the body-derived stats it renders", () => {
    expect(countWords(body)).toBe(574);
  });

  it("server-renders the real word count and read time, not 0 placeholders", () => {
    // React separates adjacent text expressions with comment nodes; strip them
    // so the assertion reads like the visible text.
    const html = renderToString(<EntryPageListen entry={entry} />).replace(/<!-- -->/g, "");
    expect(html).toContain(">574<");
    // 574 words at 225 wpm rounds up to 3 minutes.
    expect(html).toMatch(/>3 entry\.post-read-minutes/);
    expect(html).not.toContain(">0<");
  });
});
