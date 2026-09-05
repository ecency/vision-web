import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, makeFeedPage, makeOverlay, makeRoster, makeRosterPage, makeRow, makeStatus } from "./curation-test-utils";

const state = vi.hoisted(() => ({ username: undefined as string | undefined }));

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => state.username }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: state.username ? { username: state.username } : null, account: null, isLoading: false }),
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) => selector({ toggleUiProp: vi.fn(), activeUser: state.username ? { username: state.username } : null }),
}));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    useConfig: (cond: (c: unknown) => unknown) => cond({ visionFeatures: { curationDesk: { enabled: true, recommendations: { enabled: true } } } }),
  },
}));
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>) => {
    const Lazy = React.lazy(async () => {
      const m = (await loader()) as Record<string, unknown>;
      // A forwardRef component is an object with $$typeof, not a function.
      const component = m && typeof m === "object" && !("$$typeof" in m) && "default" in m ? m.default : m;
      return { default: component as React.ComponentType };
    });
    return React.forwardRef(function DynamicStub(props: Record<string, unknown>, ref) {
      return (
        <React.Suspense fallback={null}>
          <Lazy {...props} ref={ref} />
        </React.Suspense>
      );
    });
  },
}));
vi.mock("react-virtuoso", () => ({
  Virtuoso: React.forwardRef(function VirtuosoStub(props: { data: unknown[]; itemContent: (i: number, item: unknown) => React.ReactNode }, ref) {
    React.useImperativeHandle(ref, () => ({ scrollIntoView: vi.fn(), scrollToIndex: vi.fn() }));
    return <div>{props.data.map((item, i) => <React.Fragment key={i}>{props.itemContent(i, item)}</React.Fragment>)}</div>;
  }),
}));
vi.mock("@/features/curation-desk/curation-quick-view", () => ({
  CurationQuickView: ({ row }: { row: unknown }) => (row ? <div data-testid="quick-view-open" /> : null),
}));
vi.mock("@/features/shared/profile-popover", () => ({ ProfilePopover: ({ entry }: { entry: { author: string } }) => <span>@{entry.author}</span> }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", () => ({
  useCurationRecommendMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CurationQueueView } from "@/features/curation-desk/curation-queue-view";
import { isKeyboardInert, keyToAction, useCurationKeyboard, type CurationKeyHandlers } from "@/features/curation-desk/curation-keyboard";

function press(key: string, options: Partial<KeyboardEventInit> = {}, target: Element | Document = document) {
  fireEvent.keyDown(target, { key, ...options });
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnMount: false, staleTime: 60_000 } } });
}

describe("keyboard map", () => {
  it("maps every documented key", () => {
    expect(keyToAction({ key: "j", shiftKey: false })).toBe("next");
    expect(keyToAction({ key: "k", shiftKey: false })).toBe("prev");
    expect(keyToAction({ key: "Enter", shiftKey: false })).toBe("toggleQuickView");
    expect(keyToAction({ key: "o", shiftKey: false })).toBe("toggleQuickView");
    expect(keyToAction({ key: "v", shiftKey: false })).toBe("vote");
    expect(keyToAction({ key: "r", shiftKey: false })).toBe("reviewed");
    expect(keyToAction({ key: "R", shiftKey: true })).toBe("reviewedUpToHere");
    expect(keyToAction({ key: "s", shiftKey: false })).toBe("skip");
    expect(keyToAction({ key: "ArrowRight", shiftKey: false })).toBe("skip");
    expect(keyToAction({ key: "z", shiftKey: false })).toBe("snooze");
    expect(keyToAction({ key: "f", shiftKey: false })).toBe("flag");
    expect(keyToAction({ key: "n", shiftKey: false })).toBe("note");
    expect(keyToAction({ key: "x", shiftKey: false })).toBe("recommend");
    expect(keyToAction({ key: "O", shiftKey: true })).toBe("openExternal");
    expect(keyToAction({ key: "?", shiftKey: true })).toBe("help");
    expect(keyToAction({ key: "q", shiftKey: false })).toBeNull();
  });

  it("is inert inside editable targets, with an open modal, an open vote slider or a chord", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(isKeyboardInert({ target: input, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    expect(isKeyboardInert({ target: document.body, ctrlKey: true, metaKey: false, altKey: false })).toBe(true);
    expect(isKeyboardInert({ target: document.body, ctrlKey: false, metaKey: false, altKey: false })).toBe(false);

    const slider = document.createElement("div");
    slider.className = "entry-vote-btn";
    slider.setAttribute("aria-expanded", "true");
    document.body.appendChild(slider);
    expect(isKeyboardInert({ target: document.body, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    slider.remove();

    // Modal portals a backdrop AND a content wrapper, in that order.
    const modal = document.createElement("div");
    modal.id = "modal-dialog-container";
    const backdrop = document.createElement("div");
    const wrapper = document.createElement("div");
    const content = document.createElement("div");
    wrapper.appendChild(content);
    modal.append(backdrop, wrapper);
    document.body.appendChild(modal);
    expect(isKeyboardInert({ target: document.body, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);

    // The desk's own drawer is the one modal that keeps the keys alive, and
    // the empty backdrop beside it must not count as a foreign modal.
    content.setAttribute("data-curation-drawer", "");
    expect(isKeyboardInert({ target: document.body, ctrlKey: false, metaKey: false, altKey: false })).toBe(false);

    // A second, foreign dialog over the drawer makes the keys inert again.
    const other = document.createElement("div");
    other.appendChild(document.createElement("div"));
    modal.appendChild(other);
    expect(isKeyboardInert({ target: document.body, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    modal.remove();
    input.remove();
  });

  it("lets a letter key through on a focused row action but not Enter", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    // Enter activates the button natively; the desk must not also toggle the
    // drawer. j and k stay alive so navigation survives a row action.
    expect(isKeyboardInert({ target: button, key: "Enter", ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    expect(isKeyboardInert({ target: button, key: "j", ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
    button.remove();
  });
});

describe("useCurationKeyboard", () => {
  it("calls the handler for a key and nothing while typing", () => {
    const handlers = Object.fromEntries(
      ["next", "prev", "toggleQuickView", "vote", "reviewed", "reviewedUpToHere", "skip", "snooze", "flag", "note", "recommend", "openExternal", "help"].map((k) => [k, vi.fn()])
    ) as unknown as CurationKeyHandlers;
    renderHook(() => useCurationKeyboard(handlers, true));
    press("j");
    expect(handlers.next).toHaveBeenCalledTimes(1);
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    press("j", {}, input);
    expect(handlers.next).toHaveBeenCalledTimes(1);
    input.remove();
  });
});

describe("keyboard on the queue", () => {
  let router: ReturnType<typeof installFetchRouter>;

  beforeEach(() => {
    state.username = undefined;
    router = installFetchRouter()
      .on(/curation-desk\/status/, () => makeStatus())
      .on(/curation-desk\/roster$/, () => makeRoster())
      .on(/curation-desk\/feed/, () => makeFeedPage([makeRow({ post_id: 1 }), makeRow({ post_id: 2 }), makeRow({ post_id: 3 })]))
      .on(/curation-desk\/roster-feed/, () => makeRosterPage([makeRow({ post_id: 11, overlay: makeOverlay() }), makeRow({ post_id: 12, overlay: makeOverlay() })]))
      .on(/curation-desk\/mark$/, (_url, init) => ({ mark: null, row: { ...makeRow({ post_id: Number(JSON.parse(String(init?.body)).permlink.split("-")[1]) }), overlay: makeOverlay({ team_mark: "reviewed", team_mark_by: "curator1" }) } }))
      .on(/curation-desk\/tick/, () => ({ overlay: [], deltas: { marks: [], flags: [], signals: [] }, team_cursor: { post_id: null, created: null }, active_curators: [], trail_alerts: [], generated_at: "x", truncated: false }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("j and k move aria-current across rows", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    const articles = await screen.findAllByRole("article");
    expect(articles).toHaveLength(3);
    await act(async () => press("j"));
    expect(screen.getAllByRole("article")[0]).toHaveAttribute("aria-current", "true");
    await act(async () => press("j"));
    expect(screen.getAllByRole("article")[1]).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByRole("article")[0]).not.toHaveAttribute("aria-current");
    await act(async () => press("k"));
    expect(screen.getAllByRole("article")[0]).toHaveAttribute("aria-current", "true");
  });

  it("ignores keys typed into an input and while a vote slider is open", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    await screen.findAllByRole("article");
    const input = document.createElement("input");
    document.body.appendChild(input);
    await act(async () => press("j", {}, input));
    expect(screen.queryAllByRole("article").some((a) => a.getAttribute("aria-current") === "true")).toBe(false);
    input.remove();

    const slider = document.createElement("div");
    slider.className = "entry-vote-btn";
    slider.setAttribute("aria-expanded", "true");
    document.body.appendChild(slider);
    await act(async () => press("j"));
    expect(screen.queryAllByRole("article").some((a) => a.getAttribute("aria-current") === "true")).toBe(false);
    slider.remove();
  });

  it("r marks reviewed for a roster user and is a no-op for a member", async () => {
    state.username = "curator1";
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    await screen.findAllByRole("article");
    await act(async () => press("j"));
    await act(async () => press("r"));
    await waitFor(() => expect(router.callsTo(/curation-desk\/mark$/)).toHaveLength(1));
    expect(router.callsTo(/curation-desk\/mark$/)[0].body).toMatchObject({ state: "reviewed", code: "code-1" });
  });

  it("Enter opens the drawer once: the row no longer handles it too", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    const articles = await screen.findAllByRole("article");
    // Focus a row the way a keyboard user reaches it, then press Enter on it.
    await act(async () => press("j"));
    await act(async () => press("Enter", {}, articles[0]));
    expect(screen.getByTestId("quick-view-open")).toBeInTheDocument();
    // A second Enter closes it: one handler, not two cancelling each other.
    await act(async () => press("Enter", {}, articles[0]));
    expect(screen.queryByTestId("quick-view-open")).toBeNull();
  });

  it("r never posts for a member", async () => {
    state.username = "member1";
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    await screen.findAllByRole("article");
    await act(async () => press("j"));
    await act(async () => press("r"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(router.callsTo(/curation-desk\/mark$/)).toHaveLength(0);
  });
});
