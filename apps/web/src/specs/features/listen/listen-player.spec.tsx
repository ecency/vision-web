import { vi, describe, it, expect, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";

/*
  The Listen bar on top of a post: hidden for comments and unreadable posts, a login
  prompt for visitors, a confirm-then-unlock flow for readers (Points are spent, so
  never on a single click), the top-up prompt on a 402, and the player once the audio
  is ready, with one chip per language track.
*/

function defaultStatusOptions(author: string, permlink: string, username?: string) {
  return {
    queryKey: ["spec", "listen", author, permlink, username],
    queryFn: async () => status.current,
    enabled: true
  };
}

const { status, mutate, toggleUiProp, toastError, activeUser, ensureValidToken } = vi.hoisted(() => ({
  ensureValidToken: vi.fn(async () => "fresh-token" as string | undefined),
  status: { current: null as any },
  mutate: vi.fn(),
  toggleUiProp: vi.fn(),
  toastError: vi.fn(),
  activeUser: { current: null as any }
}));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getListenStatusQueryOptions: vi.fn(defaultStatusOptions),
  useListenUnlock: vi.fn(() => ({ mutate, isPending: false })),
  makeIdempotencyKey: vi.fn(() => "key-1234567890")
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  getAccessToken: vi.fn(() => "token"),
  ensureValidToken
}));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn(() => ({ activeUser: activeUser.current }))
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: vi.fn((selector: any) => selector({ toggleUiProp }))
}));
vi.mock("@/features/shared", () => ({ error: toastError, success: vi.fn() }));
vi.mock("@/features/shared/points-topup-cta", () => ({
  PointsTopupCta: ({ required }: { required?: number }) => <div>topup {required}</div>
}));

import { ListenPlayer, formatTime, isUnreadableScript, languageName, pickTrack } from "@/features/listen";
import { mockEntry, renderWithQueryClient } from "@/specs/test-utils";

const TRACKS = [
  { lang: "es", seconds: 160, url: "https://audio.test/es.m4a" },
  { lang: "en", seconds: 150, url: "https://audio.test/en.m4a" }
];
const LANGS = [
  { lang: "es", share: 0.54, seconds: 160 },
  { lang: "en", share: 0.46, seconds: 150 }
];

function render(entry = mockEntry({ author: "noelyss", permlink: "plaza", body: "word ".repeat(300) })) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithQueryClient(<ListenPlayer entry={entry} />, { queryClient });
}

describe("ListenPlayer", () => {
  beforeEach(async () => {
    const { getListenStatusQueryOptions } = await import("@ecency/sdk");
    vi.mocked(getListenStatusQueryOptions).mockImplementation(defaultStatusOptions as any);
    mutate.mockReset();
    toggleUiProp.mockReset();
    toastError.mockReset();
    activeUser.current = null;
    ensureValidToken.mockReset();
    ensureValidToken.mockImplementation(async () => "fresh-token");
    status.current = { cost: 50, unlocked: false, status: "none", languages: [] };
  });

  it("renders nothing for a comment", async () => {
    const { container } = render(mockEntry({ parent_author: "someone", body: "hi" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector(".listen-bar")).toBeNull();
  });

  it("renders nothing when the post's language has no voice", async () => {
    activeUser.current = { username: "alice" };
    status.current = { cost: 50, unlocked: false, status: "unsupported", languages: [] };
    const { container } = render();
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector(".listen-bar")).toBeNull();
  });

  it("asks a visitor to log in", async () => {
    render();
    fireEvent.click(await screen.findByText("listen.login"));
    expect(toggleUiProp).toHaveBeenCalledWith("login");
  });

  it("draws the bar for a visitor at once, and asks for the status only once the page is idle", async () => {
    const statusFn = vi.fn(async () => status.current);
    const { getListenStatusQueryOptions } = await import("@ecency/sdk");
    vi.mocked(getListenStatusQueryOptions).mockImplementation(((author: string, permlink: string) => ({
      queryKey: ["spec", "listen", author, permlink],
      queryFn: statusFn,
      enabled: true
    })) as any);
    const { container } = render();
    // first render, before any effect or query: crawlers and the first paint see it
    expect(container.querySelector(".listen-bar")).not.toBeNull();
    expect(container.querySelector(".listen-bar")!.hasAttribute("data-nosnippet")).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    expect(statusFn).not.toHaveBeenCalled();
    await waitFor(() => expect(statusFn).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("hides a visitor's bar once the post is known to be unsupported", async () => {
    status.current = { cost: 50, unlocked: false, status: "unsupported", languages: [] };
    const { container } = render();
    expect(container.querySelector(".listen-bar")).not.toBeNull();
    await waitFor(() => expect(container.querySelector(".listen-bar")).toBeNull(), { timeout: 3000 });
  });

  it("never offers a post in a script the voice cannot read", async () => {
    const thai = mockEntry({ author: "noelyss", permlink: "plaza", body: "สวัสดีครับ ".repeat(200) });
    const { container } = render(thai);
    expect(container.querySelector(".listen-bar")).toBeNull();
  });

  it("keeps the bar in place while a reader's status loads", async () => {
    activeUser.current = { username: "alice" };
    status.current = new Promise(() => undefined); // never answers
    const { container } = render();
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector(".listen-bar")).not.toBeNull();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByText("listen.unlock")).toBeNull();
    expect(screen.queryByText("listen.login")).toBeNull();
  });

  it("names the languages before unlock", async () => {
    activeUser.current = { username: "alice" };
    status.current = { cost: 50, unlocked: false, status: "none", languages: LANGS };
    render();
    expect(await screen.findByText(/Spanish \+ English/)).toBeTruthy();
  });

  it("confirms before spending, then unlocks with the key and a fresh token", async () => {
    activeUser.current = { username: "alice" };
    render();
    fireEvent.click(await screen.findByText("listen.unlock"));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("listen.confirm")).toBeTruthy();
    fireEvent.click(screen.getByText("g.confirm"));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0][0]).toMatchObject({
      author: "noelyss",
      permlink: "plaza",
      idempotency_key: "key-1234567890",
      code: "fresh-token"
    });
  });

  it("offers a top-up when the reader is short of Points", async () => {
    activeUser.current = { username: "alice" };
    mutate.mockImplementation((_params, { onError }) =>
      onError(Object.assign(new Error("402"), { status: 402, data: { required: 50, available: 10 } }))
    );
    render();
    fireEvent.click(await screen.findByText("listen.unlock"));
    fireEvent.click(screen.getByText("g.confirm"));
    expect(await screen.findByText("topup 50")).toBeTruthy();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("lets the reader try again after topping up", async () => {
    activeUser.current = { username: "alice" };
    mutate.mockImplementationOnce((_params, { onError }) =>
      onError(Object.assign(new Error("402"), { status: 402, data: { required: 50, available: 10 } }))
    );
    render();
    fireEvent.click(await screen.findByText("listen.unlock"));
    fireEvent.click(screen.getByText("g.confirm"));
    fireEvent.click(await screen.findByText("listen.retry"));
    fireEvent.click(screen.getByText("g.confirm"));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  });

  it("does not unlock twice on a double click, nor without a token", async () => {
    activeUser.current = { username: "alice" };
    let release: (v: string | undefined) => void = () => undefined;
    ensureValidToken.mockImplementation(async () => "fresh-token");
    render();
    fireEvent.click(await screen.findByText("listen.unlock"));
    ensureValidToken.mockImplementation(() => new Promise((r) => (release = r)));
    const confirm = screen.getByText("g.confirm");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    release(undefined);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("listen.login-again"));
    expect(ensureValidToken).toHaveBeenCalledTimes(2); // mount + one click
    expect(mutate).not.toHaveBeenCalled();
  });

  it("refreshes the token before renewing an expired audio URL", async () => {
    activeUser.current = { username: "alice" };
    status.current = { cost: 50, unlocked: true, status: "ready", languages: LANGS, tracks: TRACKS };
    const { getListenStatusQueryOptions } = await import("@ecency/sdk");
    const { container } = render();
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    ensureValidToken.mockImplementation(async () => "renewed-token");
    fireEvent.error(container.querySelector("audio")!);
    await waitFor(() =>
      expect(vi.mocked(getListenStatusQueryOptions)).toHaveBeenCalledWith(
        "noelyss",
        "plaza",
        "alice",
        "renewed-token",
        expect.anything()
      )
    );
  });

  it("keeps the unlocked player when the token cannot be renewed", async () => {
    activeUser.current = { username: "alice" };
    status.current = { cost: 50, unlocked: true, status: "ready", languages: LANGS, tracks: TRACKS };
    const { getListenStatusQueryOptions } = await import("@ecency/sdk");
    const { container } = render();
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    vi.mocked(getListenStatusQueryOptions).mockClear();
    ensureValidToken.mockImplementation(async () => undefined);
    fireEvent.error(container.querySelector("audio")!);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("listen.login-again"));
    // no anonymous refetch: it would answer "locked" and drop the player
    expect(vi.mocked(getListenStatusQueryOptions).mock.calls.some((c) => c[3] === undefined)).toBe(false);
    expect(container.querySelector("audio")).not.toBeNull();
  });

  it("shows progress while the audio is being made", async () => {
    activeUser.current = { username: "alice" };
    status.current = { cost: 50, unlocked: true, status: "preparing", languages: LANGS };
    render();
    expect(await screen.findByText("listen.preparing")).toBeTruthy();
    expect(screen.queryByText("listen.unlock")).toBeNull();
  });

  it("plays the ready track and switches language", async () => {
    activeUser.current = { username: "alice" };
    status.current = { cost: 50, unlocked: true, status: "ready", languages: LANGS, tracks: TRACKS };
    const { container } = render();
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    // the i18next mock reports an English UI, which has a track
    expect(container.querySelector("audio")!.getAttribute("src")).toBe("https://audio.test/en.m4a");
    fireEvent.click(screen.getByText("Spanish"));
    expect(container.querySelector("audio")!.getAttribute("src")).toBe("https://audio.test/es.m4a");
    expect(screen.getByText("Spanish").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("listen helpers", () => {
  it("tells unreadable scripts from supported ones", () => {
    expect(isUnreadableScript("สวัสดีครับ ทุกคน วันนี้อากาศดีมาก")).toBe(true); // Thai
    expect(isUnreadableScript("今天天气很好，我们去公园散步吧。")).toBe(true); // Chinese
    expect(isUnreadableScript("שלום לכולם, היום יום יפה")).toBe(true); // Hebrew
    expect(isUnreadableScript("今日はとても良い天気ですね。公園に行きましょう。")).toBe(false); // Japanese
    // kanji-heavy Japanese: the kana are what tell it from Chinese
    expect(isUnreadableScript("東京都庁舎の展望室見学報告。新宿駅西口から徒歩十分、入場無料です。")).toBe(false);
    expect(isUnreadableScript("오늘 날씨가 정말 좋네요")).toBe(false); // Korean
    expect(isUnreadableScript("Hola a todos, hoy es un buen día")).toBe(false);
    expect(isUnreadableScript("مرحبا بالجميع")).toBe(false); // Arabic: left to the server
    expect(isUnreadableScript("Great trip ![](https://images.ecency.com/漢字.png) 很好")).toBe(false);
    expect(isUnreadableScript("")).toBe(false);
  });

  it("prefers the interface language, else the main track", () => {
    expect(pickTrack(TRACKS, "en-US")?.lang).toBe("en");
    expect(pickTrack(TRACKS, "de")?.lang).toBe("es");
  });

  it("formats time", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65.9)).toBe("1:05");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });

  it("names languages", () => {
    expect(languageName("es", "en")).toBe("Spanish");
    expect(languageName("xx-invalid-!!", "en")).toBe("XX-INVALID-!!");
  });
});
