import { vi, describe, it, expect, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";

/*
  The Listen bar on top of a post: hidden for comments and unreadable posts, a login
  prompt for visitors, a confirm-then-unlock flow for readers (Points are spent, so
  never on a single click), the top-up prompt on a 402, and the player once the audio
  is ready, with one chip per language track.
*/

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
  getListenStatusQueryOptions: vi.fn((author: string, permlink: string, username?: string) => ({
    queryKey: ["spec", "listen", author, permlink, username],
    queryFn: async () => status.current,
    enabled: true
  })),
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

import { ListenPlayer, formatTime, languageName, pickTrack } from "@/features/listen";
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
  beforeEach(() => {
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
