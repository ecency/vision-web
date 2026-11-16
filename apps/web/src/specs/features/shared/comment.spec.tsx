import { vi } from "vitest";
import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Entry } from "@/entities";

// --- Mock the heavy children so we can exercise the composer logic in isolation ---
vi.mock("@/features/shared/editor-toolbar", () => ({
  EditorToolbar: () => null,
  toolbarEventListener: vi.fn()
}));

vi.mock("@/features/shared/textarea-autocomplete", () => ({
  // A plain textarea that forwards value/onChange/ref — onKeyDown bubbles to the
  // `.comment-body` handler exactly like the real component.
  // eslint-disable-next-line react/display-name
  TextareaAutocomplete: React.forwardRef<
    HTMLTextAreaElement,
    {
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
      placeholder?: string;
      id?: string;
    }
  >(({ value, onChange, placeholder, id }, ref) => (
    <textarea
      ref={ref}
      id={id}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={onChange}
      data-testid="comment-textarea"
    />
  ))
}));

vi.mock("@/features/shared/comment/comment-preview", () => ({
  CommentPreview: ({ text }: { text: string }) => <div data-testid="comment-preview">{text}</div>
}));

vi.mock("@/features/shared", () => ({
  AvailableCredits: () => null,
  LoginRequired: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  handleAndReportError: vi.fn(() => true)
}));

vi.mock("@/features/shared/rc-precheck", () => ({
  RcPrecheckBanner: () => null
}));

vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/context", () => ({
  EntryPageContext: React.createContext({ selection: "", setSelection: vi.fn() })
}));

const activeAccount = vi.hoisted(() => ({ username: "tester" }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: activeAccount.username } })
}));

vi.mock("@ecency/sdk", () => ({
  getCommunityContextQueryOptions: vi.fn(() => ({
    queryKey: ["community-context"],
    queryFn: async () => ({})
  })),
  getCommunityPermissions: vi.fn(() => ({ canComment: true })),
  getCommunityType: vi.fn(() => -1),
  // Real pure impls so the short-reply hint behaves like production here.
  QUEST_MIN_CONTENT_LENGTH: 25,
  earnsQuestContentCredit: (body?: string | null) =>
    Array.from((body ?? "").replace(/https?:\/\/\S+/g, "")).length > 25
}));

// Inline mock (no importActual) so we don't pull the real utils → consts → sdk
// chain. Comment only uses `isCommunity` from this module.
vi.mock("@/utils", async () => ({
  // The real predicate, not a stand-in: the composer's submit gate is exactly
  // this rule, so a hand-rolled copy here could drift and the gate tests would
  // stop meaning anything. `is-blank-body` is a leaf module, so importing it
  // does not pull in the utils -> consts -> sdk chain this mock exists to avoid.
  ...(await import("@/utils/is-blank-body")),
  isCommunity: (category?: string) => !!category && category.startsWith("hive-"),
  // Same shapes the real helpers produce: the RC estimate reads their length,
  // so a stub of the wrong shape would make the composer's payload meaningless.
  createReplyPermlink: (toAuthor?: string) => `re-${toAuthor}-20260814t120000000z`,
  makeJsonMetaDataReply: (tags: string[], appVer: string) => ({
    tags,
    app: `ecency/${appVer}-vision`,
    format: "markdown+html"
  }),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

import { Comment } from "@/features/shared/comment";
import { EntryPageContext } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/context";

const entry = {
  author: "alice",
  permlink: "post-1",
  category: "ecency",
  body: "",
  json_metadata: {}
} as unknown as Entry;

function renderComment(
  onSubmit = vi.fn().mockResolvedValue(undefined),
  props: { isEdit?: boolean } = {}
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <Comment entry={entry} onSubmit={onSubmit} submitText="Reply" {...props} />
    </QueryClientProvider>
  );
  return { onSubmit, ...utils };
}

function type(getByRole: (role: string) => HTMLElement, value: string) {
  fireEvent.change(getByRole("textbox"), { target: { value } });
}

// The composer hands formatting to the toolbar as a DOM event on `window`
// (the toolbar itself is mocked out above); this is that boundary.
function listenFor(action: string) {
  const heard = vi.fn();
  window.addEventListener(action, heard, { once: true });
  return heard;
}

describe("Comment composer", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  test("Cmd/Ctrl+Enter submits the typed comment", async () => {
    const { onSubmit, getByRole, container } = renderComment();

    type(getByRole, "hello world");
    const body = container.querySelector(".comment-body")!;
    fireEvent.keyDown(body, { key: "Enter", ctrlKey: true });

    expect(onSubmit).toHaveBeenCalledWith("hello world", { declinePayout: false });
  });

  test("plain Enter does NOT submit (newline behavior preserved)", () => {
    const { onSubmit, getByRole, container } = renderComment();

    type(getByRole, "hello");
    fireEvent.keyDown(container.querySelector(".comment-body")!, { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("Cmd/Ctrl+Enter does NOT submit when the text is empty", () => {
    const { onSubmit, container } = renderComment();

    fireEvent.keyDown(container.querySelector(".comment-body")!, { key: "Enter", metaKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("the submit button does NOT submit an empty composer", () => {
    const { onSubmit, getByRole } = renderComment();

    fireEvent.click(getByRole("button", { name: "Reply" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("the submit button does NOT submit whitespace only", () => {
    const { onSubmit, getByRole } = renderComment();

    type(getByRole, "   \n  ");
    fireEvent.click(getByRole("button", { name: "Reply" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("the submit button does NOT submit zero-width characters", () => {
    // These survive String.trim(), so a trim-only gate would let them through
    // and broadcast a comment that renders as nothing.
    const { onSubmit, getByRole } = renderComment();

    type(getByRole, "\u200b\u2060 \u200c");
    fireEvent.click(getByRole("button", { name: "Reply" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("warns that a reply too short to earn points will not count", () => {
    const { getByRole } = renderComment();

    type(getByRole, "Thank you");

    expect(getByRole("status")).toBeTruthy();
  });

  test("counts a link-only reply as too short, matching the backend rule", () => {
    const { getByRole } = renderComment();

    type(getByRole, "https://i.example.com/a-very-long-image-url-here.gif");

    expect(getByRole("status")).toBeTruthy();
  });

  test("counts emoji as the backend does, not as UTF-16 code units", () => {
    const { getByRole } = renderComment();

    // 13 astral emoji measure as 13 code points, under the minimum. Counting UTF-16
    // units would score them as 26 and wrongly promise points.
    type(getByRole, "😂".repeat(13));

    expect(getByRole("status")).toBeTruthy();
  });

  test("drops the warning once the reply is long enough to earn", () => {
    const { getByRole, queryByRole } = renderComment();

    type(getByRole, "Thank you");
    expect(getByRole("status")).toBeTruthy();

    type(getByRole, "Thank you, this is a genuinely useful reply with something to say");
    expect(queryByRole("status")).toBeNull();
  });

  test("stays quiet on an empty composer", () => {
    const { queryByRole } = renderComment();

    expect(queryByRole("status")).toBeNull();
  });

  test("Ctrl+B asks the toolbar for bold", () => {
    const { getByRole, container } = renderComment();
    const bold = listenFor("bold");

    type(getByRole, "hello world");
    fireEvent.keyDown(container.querySelector(".comment-body")!, {
      key: "b",
      code: "KeyB",
      ctrlKey: true
    });

    expect(bold).toHaveBeenCalledTimes(1);
  });

  test("Cmd+I asks the toolbar for italic", () => {
    const { getByRole, container } = renderComment();
    const italic = listenFor("italic");

    type(getByRole, "hello world");
    fireEvent.keyDown(container.querySelector(".comment-body")!, {
      key: "i",
      code: "KeyI",
      metaKey: true
    });

    expect(italic).toHaveBeenCalledTimes(1);
  });

  test("Ctrl+B does not submit the reply", () => {
    const { onSubmit, getByRole, container } = renderComment();

    type(getByRole, "hello world");
    fireEvent.keyDown(container.querySelector(".comment-body")!, {
      key: "b",
      code: "KeyB",
      ctrlKey: true
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("Cmd/Ctrl+Enter is suppressed while the mention dropdown is open", () => {
    const { onSubmit, getByRole, container } = renderComment();

    type(getByRole, "hey @al");
    // Simulate the react-textarea-autocomplete dropdown being open.
    const body = container.querySelector(".comment-body")!;
    body.insertAdjacentHTML("beforeend", '<div class="rta__autocomplete"></div>');

    fireEvent.keyDown(body, { key: "Enter", metaKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // react-use's useLocalStorage setter sees the state from when its key was set,
  // so a functional update (prev => quote + prev) dropped what had been typed since.
  test("quoting a selection keeps the text typed so far", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (selection: string) => (
      <QueryClientProvider client={queryClient}>
        <EntryPageContext.Provider value={{ selection, setSelection: vi.fn() } as never}>
          <Comment entry={entry} onSubmit={vi.fn()} submitText="Reply" />
        </EntryPageContext.Provider>
      </QueryClientProvider>
    );
    const view = render(ui(""));
    type(view.getByRole, "my reply");

    view.rerender(ui("> a quote\n"));

    expect(view.getByRole("textbox")).toHaveValue("> a quote\nmy reply");
  });

  describe("decline payout", () => {
    test("offers an unchecked Decline payout option on a new reply", () => {
      const { getByRole } = renderComment();

      const toggle = getByRole("checkbox", { name: "comment.decline-payout" });
      expect(toggle).toHaveAttribute("aria-checked", "false");
    });

    test("submits the reply with declinePayout once it is checked", () => {
      const { onSubmit, getByRole } = renderComment();

      fireEvent.click(getByRole("checkbox", { name: "comment.decline-payout" }));
      type(getByRole, "hello world");
      fireEvent.click(getByRole("button", { name: "Reply" }));

      expect(onSubmit).toHaveBeenCalledWith("hello world", { declinePayout: true });
    });

    test("toggles from the keyboard", () => {
      const { getByRole } = renderComment();
      const toggle = getByRole("checkbox", { name: "comment.decline-payout" });

      fireEvent.keyDown(toggle, { key: " " });

      expect(toggle).toHaveAttribute("aria-checked", "true");
    });

    test("resets to unchecked once the reply is posted, so the next reply keeps its payout", async () => {
      const first = renderComment();

      fireEvent.click(first.getByRole("checkbox", { name: "comment.decline-payout" }));
      type(first.getByRole, "hello world");
      await act(async () => {
        fireEvent.click(first.getByRole("button", { name: "Reply" }));
      });
      first.unmount();

      const next = renderComment();
      expect(next.getByRole("checkbox", { name: "comment.decline-payout" })).toHaveAttribute(
        "aria-checked",
        "false"
      );
    });

    // A failed broadcast hands the reply back as { text, declinePayout }: the choice
    // the reply was SENT with, carried by the failure itself (#333 review).
    type Failed = { text: string; declinePayout: boolean; username?: string };
    // `username` is the account that sent the failed reply; the spec's active account by default.
    function renderFailed(failedReply: Failed | null) {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      // Parents hold the failed reply in state, so a rerender passes the same
      // object: keep one prop object per input, or every rerender re-fires restore.
      const props = new Map<Failed, Failed & { username: string }>();
      const prop = (reply: Failed) => {
        if (!props.has(reply)) props.set(reply, { username: "tester", ...reply });
        return props.get(reply)!;
      };
      const ui = (reply: Failed | null) => (
        <QueryClientProvider client={queryClient}>
          <Comment entry={entry} onSubmit={onSubmit} submitText="Reply" failedReply={reply && prop(reply)} />
        </QueryClientProvider>
      );
      const utils = render(ui(failedReply));
      return { ...utils, onSubmit, rerenderFailed: (r: Failed | null) => utils.rerender(ui(r)) };
    }
    const checkbox = (getByRole: (role: string, o: { name: string }) => HTMLElement) =>
      getByRole("checkbox", { name: "comment.decline-payout" });

    test("comes back checked when a declined reply fails", () => {
      const { getByRole } = renderFailed({ text: "hello world", declinePayout: true });

      expect(getByRole("textbox")).toHaveValue("hello world");
      expect(checkbox(getByRole)).toHaveAttribute("aria-checked", "true");
    });

    test("comes back checked even when the failed text is already in the draft", () => {
      // The curation desk writes the failed text to the draft before reopening the box.
      window.localStorage.setItem("ecency_reply_text_alice_post-1", JSON.stringify("hello world"));
      const { getByRole } = renderFailed({ text: "hello world", declinePayout: true });

      expect(checkbox(getByRole)).toHaveAttribute("aria-checked", "true");
    });

    test("restores the choice the failed reply was sent with, not the box's current state", () => {
      const { getByRole, rerenderFailed } = renderFailed({ text: "first", declinePayout: true });
      fireEvent.click(checkbox(getByRole));
      expect(checkbox(getByRole)).toHaveAttribute("aria-checked", "false");

      rerenderFailed({ text: "second", declinePayout: true });
      expect(checkbox(getByRole)).toHaveAttribute("aria-checked", "true");

      rerenderFailed({ text: "third", declinePayout: false });
      expect(checkbox(getByRole)).toHaveAttribute("aria-checked", "false");
    });

    test("restores a reply that fails a second time unchanged", async () => {
      const { getByRole, rerenderFailed } = renderFailed({ text: "hello world", declinePayout: true });
      await act(async () => {
        fireEvent.click(getByRole("button", { name: "Reply" }));
      });
      expect(getByRole("textbox")).toHaveValue("");
      expect(checkbox(getByRole)).toHaveAttribute("aria-checked", "false");

      rerenderFailed({ text: "hello world", declinePayout: true });
      expect(getByRole("textbox")).toHaveValue("hello world");
      expect(checkbox(getByRole)).toHaveAttribute("aria-checked", "true");
    });

    test("keeps the payout choice out of storage, so it never outlives the form or crosses accounts", async () => {
      const { getByRole } = renderComment();
      fireEvent.click(checkbox(getByRole));
      type(getByRole, "hello world");
      await act(async () => {
        fireEvent.click(getByRole("button", { name: "Reply" }));
      });

      const keys = Object.keys(window.localStorage);
      expect(keys.filter((k) => k.includes("decline"))).toEqual([]);
      expect(Object.values(window.localStorage).filter((v) => v.includes("hello world"))).toEqual([]);
    });

    // A failed declined reply stays declined until it is posted: closing and reopening
    // the form, or reloading, restores the draft text from storage, and the box with it.
    const declineKeys = () => Object.keys(window.localStorage).filter((k) => k.includes("decline"));

    test("a failed declined reply is still declined after the form is closed and reopened", () => {
      const failed = renderFailed({ text: "hello world", declinePayout: true });
      failed.unmount();

      // Reopened without a failedReply (discussion-item clears it on toggle): only the draft comes back.
      const { getByRole } = renderComment();
      expect(getByRole("textbox")).toHaveValue("hello world");
      expect(checkbox(getByRole)).toHaveAttribute("aria-checked", "true");
    });

    test("a failed declined reply is still declined after a reload", () => {
      renderFailed({ text: "hello world", declinePayout: true }).unmount();
      const stored = { ...window.localStorage };
      window.localStorage.clear();
      Object.entries(stored).forEach(([k, v]) => window.localStorage.setItem(k, v as string));

      const { getByRole } = renderComment();
      expect(checkbox(getByRole)).toHaveAttribute("aria-checked", "true");
    });

    test("another account on the same browser does not inherit the decline", () => {
      renderFailed({ text: "hello world", declinePayout: true }).unmount();

      activeAccount.username = "other";
      try {
        const { getByRole } = renderComment();
        expect(checkbox(getByRole)).toHaveAttribute("aria-checked", "false");
      } finally {
        activeAccount.username = "tester";
      }
    });

    test("posting the restored reply leaves no decline keys behind", async () => {
      const { getByRole } = renderFailed({ text: "hello world", declinePayout: true });
      expect(declineKeys()).not.toEqual([]);

      await act(async () => {
        fireEvent.click(getByRole("button", { name: "Reply" }));
      });

      expect(declineKeys()).toEqual([]);
      expect(Object.values(window.localStorage).filter((v) => v.includes("hello world"))).toEqual([]);
    });

    test("unchecking the box forgets the pending decline", () => {
      const failed = renderFailed({ text: "hello world", declinePayout: true });
      fireEvent.click(checkbox(failed.getByRole));
      expect(declineKeys()).toEqual([]);
      failed.unmount();

      expect(checkbox(renderComment().getByRole)).toHaveAttribute("aria-checked", "false");
    });

    // #2103: an edit moves the stored decline to the new text rather than dropping it.
    test("editing the failed text moves the pending decline to the new text", () => {
      const failed = renderFailed({ text: "hello world", declinePayout: true });
      type(failed.getByRole, "something else");
      expect(declineKeys().map((k) => window.localStorage.getItem(k))).toEqual([JSON.stringify("something else")]);
    });

    test("a reply that fails after switching accounts is not restored into the new account's form", () => {
      const view = renderFailed(null);
      activeAccount.username = "other";
      try {
        view.rerenderFailed(null);
        view.rerenderFailed({ text: "sent by tester", declinePayout: true, username: "tester" });

        expect(view.getByRole("textbox")).toHaveValue("");
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "false");
        expect(declineKeys()).toEqual([]);
      } finally {
        activeAccount.username = "tester";
      }
    });

    test("switching accounts with the box checked unchecks it", () => {
      const view = renderFailed(null);
      fireEvent.click(checkbox(view.getByRole));
      expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");

      activeAccount.username = "other";
      try {
        view.rerenderFailed(null);
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "false");
      } finally {
        activeAccount.username = "tester";
      }
    });

    test("switching away and back restores the held failed reply's decline", () => {
      const failed = { text: "hello world", declinePayout: true, username: "tester" };
      const view = renderFailed(failed);
      expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");

      try {
        activeAccount.username = "other";
        view.rerenderFailed(failed);
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "false");

        activeAccount.username = "tester";
        view.rerenderFailed(failed);
        expect(view.getByRole("textbox")).toHaveValue("hello world");
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
      } finally {
        activeAccount.username = "tester";
      }
    });

    // A declined payout cannot be undone on chain: once the writer has unchecked
    // the box, switching away and back must not check it again.
    test("switching away and back keeps an unchecked box unchecked", () => {
      const failed = { text: "hello world", declinePayout: true, username: "tester" };
      const view = renderFailed(failed);
      fireEvent.click(checkbox(view.getByRole));
      expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "false");

      try {
        activeAccount.username = "other";
        view.rerenderFailed(failed);
        activeAccount.username = "tester";
        view.rerenderFailed(failed);
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "false");
      } finally {
        activeAccount.username = "tester";
      }
    });

    // The draft text is shared between accounts: B replacing it must not let A's
    // stored decline check the box for B's different text when A comes back.
    test("switching back after another account replaced the draft does not decline the new text", () => {
      const failed = { text: "hello world", declinePayout: true, username: "tester" };
      const view = renderFailed(failed);

      try {
        activeAccount.username = "other";
        view.rerenderFailed(failed);
        type(view.getByRole, "different text");

        activeAccount.username = "tester";
        view.rerenderFailed(failed);
        expect(view.getByRole("textbox")).toHaveValue("different text");
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "false");
        expect(declineKeys()).toEqual([]);
      } finally {
        activeAccount.username = "tester";
      }
    });

    test("a failure that landed while another account was active is restored on switching back", () => {
      const view = renderFailed(null);
      const failed = { text: "sent by tester", declinePayout: true, username: "tester" };
      try {
        activeAccount.username = "other";
        view.rerenderFailed(null);
        view.rerenderFailed(failed);
        expect(view.getByRole("textbox")).toHaveValue("");

        activeAccount.username = "tester";
        view.rerenderFailed(failed);
        expect(view.getByRole("textbox")).toHaveValue("sent by tester");
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
      } finally {
        activeAccount.username = "tester";
      }
    });

    test("a restored failure is not replayed over the writer's edits on switching back", () => {
      const failed = { text: "hello world", declinePayout: true, username: "tester" };
      const view = renderFailed(failed);
      type(view.getByRole, "edited");

      try {
        activeAccount.username = "other";
        view.rerenderFailed(failed);
        activeAccount.username = "tester";
        view.rerenderFailed(failed);
        // The writer's edit stays, and so does the decline that followed it (#2103).
        expect(view.getByRole("textbox")).toHaveValue("edited");
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
      } finally {
        activeAccount.username = "tester";
      }
    });

    // A form reused for another post must judge that post's stored decline
    // against that post's draft, never the previous post's text.
    test("moving the form to another post does not decline that post's different draft", () => {
      localStorage.setItem("ecency_reply_failed_decline_tester_alice_post-2", JSON.stringify("same words"));
      localStorage.setItem("ecency_reply_text_alice_post-2", JSON.stringify("unrelated draft"));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const ui = (e: Entry) => (
        <QueryClientProvider client={queryClient}>
          <Comment entry={e} onSubmit={vi.fn()} submitText="Reply" />
        </QueryClientProvider>
      );
      const view = render(ui(entry));
      type(view.getByRole, "same words");

      view.rerender(ui({ ...entry, permlink: "post-2" } as Entry));

      expect(view.getByRole("textbox")).toHaveValue("unrelated draft");
      expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "false");
    });

    test("a failure for the new account landing with the switch is restored checked", () => {
      const view = renderFailed(null);
      try {
        activeAccount.username = "other";
        view.rerenderFailed({ text: "sent by other", declinePayout: true, username: "other" });

        expect(view.getByRole("textbox")).toHaveValue("sent by other");
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
      } finally {
        activeAccount.username = "tester";
      }
    });

    // #2103: fixing a typo in a failed declined reply keeps it declined.
    test("editing a failed declined reply keeps the decline across reopening", () => {
      const failed = renderFailed({ text: "hello wrold", declinePayout: true });
      type(failed.getByRole, "hello world");
      expect(checkbox(failed.getByRole)).toHaveAttribute("aria-checked", "true");
      failed.unmount();

      const reopened = renderComment();
      expect(reopened.getByRole("textbox")).toHaveValue("hello world");
      expect(checkbox(reopened.getByRole)).toHaveAttribute("aria-checked", "true");
    });

    // Every new reply form starts at "": a decline that followed the draft down to
    // blank would pre-check the next, unrelated reply (cannot be undone on chain).
    test("clearing a failed declined reply drops the decline", async () => {
      const failed = renderFailed({ text: "hello world", declinePayout: true });
      type(failed.getByRole, "");
      expect(declineKeys()).toEqual([]);
      failed.unmount();

      const next = renderComment();
      expect(checkbox(next.getByRole)).toHaveAttribute("aria-checked", "false");
      type(next.getByRole, "a brand new reply, days later");
      await act(async () => {
        fireEvent.click(next.getByRole("button", { name: "Reply" }));
      });
      expect(next.onSubmit).toHaveBeenCalledWith("a brand new reply, days later", { declinePayout: false });
    });

    test("a blank stored decline is never applied", () => {
      window.localStorage.setItem("ecency_reply_failed_decline_tester_alice_post-1", JSON.stringify(""));
      expect(checkbox(renderComment().getByRole)).toHaveAttribute("aria-checked", "false");
      expect(declineKeys()).toEqual([]);
    });

    // A reply that failed while its sender was signed out or switched away is kept
    // for the sender alone, and comes back into a blank form when they return.
    test("a failure kept for its sender comes back into their blank form, declined", () => {
      window.localStorage.setItem("ecency_reply_failed_text_tester_alice_post-1", JSON.stringify("kept for tester"));
      window.localStorage.setItem("ecency_reply_failed_decline_tester_alice_post-1", JSON.stringify("kept for tester"));

      const view = renderComment();
      expect(view.getByRole("textbox")).toHaveValue("kept for tester");
      expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
      expect(window.localStorage.getItem("ecency_reply_failed_text_tester_alice_post-1")).toBeNull();
    });

    test("a failure kept for another account never shows in this account's form", () => {
      window.localStorage.setItem("ecency_reply_failed_text_other_alice_post-1", JSON.stringify("other's reply"));
      expect(renderComment().getByRole("textbox")).toHaveValue("");
      expect(window.localStorage.getItem("ecency_reply_failed_text_other_alice_post-1")).toBe(JSON.stringify("other's reply"));
    });

    test("a newer draft wins over a kept failure, which is dropped", () => {
      window.localStorage.setItem("ecency_reply_text_alice_post-1", JSON.stringify("newer draft"));
      window.localStorage.setItem("ecency_reply_failed_text_tester_alice_post-1", JSON.stringify("kept for tester"));
      expect(renderComment().getByRole("textbox")).toHaveValue("newer draft");
      expect(window.localStorage.getItem("ecency_reply_failed_text_tester_alice_post-1")).toBeNull();
    });

    test("switching back to the sender with the form open brings a kept failure back", () => {
      window.localStorage.setItem("ecency_reply_failed_text_tester_alice_post-1", JSON.stringify("kept for tester"));
      window.localStorage.setItem("ecency_reply_failed_decline_tester_alice_post-1", JSON.stringify("kept for tester"));
      activeAccount.username = "other";
      try {
        const view = renderFailed(null);
        expect(view.getByRole("textbox")).toHaveValue("");
        activeAccount.username = "tester";
        view.rerenderFailed(null);
        expect(view.getByRole("textbox")).toHaveValue("kept for tester");
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
      } finally {
        activeAccount.username = "tester";
      }
    });

    // A held failure of the active account is the same reply as its kept copy: the
    // kept copy goes, and the decline the restore just stored stays (Fable, #2106).
    test("switching back with a held failure and its kept copy keeps the stored decline", () => {
      const failed = { text: "K", declinePayout: true, username: "tester" };
      activeAccount.username = "other";
      try {
        const view = renderFailed(null);
        type(view.getByRole, "other's draft");
        window.localStorage.setItem("ecency_reply_failed_text_tester_alice_post-1", JSON.stringify("K"));
        window.localStorage.setItem("ecency_reply_failed_decline_tester_alice_post-1", JSON.stringify("K"));
        view.rerenderFailed(failed);

        activeAccount.username = "tester";
        view.rerenderFailed(failed);
        expect(view.getByRole("textbox")).toHaveValue("K");
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
        expect(window.localStorage.getItem("ecency_reply_failed_decline_tester_alice_post-1")).toBe(JSON.stringify("K"));
        expect(window.localStorage.getItem("ecency_reply_failed_text_tester_alice_post-1")).toBeNull();
      } finally {
        activeAccount.username = "tester";
      }
    });

    // Two different failures of the same account: the held one is restored with
    // its own choice; the kept one never takes its place under that checked box.
    test("a kept failure never replaces a held failure's text under its decline", () => {
      window.localStorage.setItem("ecency_reply_text_alice_post-1", JSON.stringify(""));
      window.localStorage.setItem("ecency_reply_failed_text_tester_alice_post-1", JSON.stringify("K2"));
      const view = renderFailed({ text: "F", declinePayout: true });
      expect(view.getByRole("textbox")).toHaveValue("F");
      expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
    });

    test("a kept failure restored under StrictMode keeps its decline", () => {
      window.localStorage.setItem("ecency_reply_failed_text_tester_alice_post-1", JSON.stringify("K"));
      window.localStorage.setItem("ecency_reply_failed_decline_tester_alice_post-1", JSON.stringify("K"));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const view = render(
        <React.StrictMode>
          <QueryClientProvider client={queryClient}>
            <Comment entry={entry} onSubmit={vi.fn()} submitText="Reply" />
          </QueryClientProvider>
        </React.StrictMode>
      );
      expect(view.getByRole("textbox")).toHaveValue("K");
      expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
      expect(window.localStorage.getItem("ecency_reply_failed_decline_tester_alice_post-1")).toBe(JSON.stringify("K"));
    });

    // Fable round 3 (#2106): a restored kept reply that another account then
    // cleared must not come back checked on a blank form when the sender returns.
    test("a restored kept reply cleared by another account does not re-check a blank form", async () => {
      window.localStorage.setItem("ecency_reply_failed_text_tester_alice_post-1", JSON.stringify("K"));
      window.localStorage.setItem("ecency_reply_failed_decline_tester_alice_post-1", JSON.stringify("K"));
      const view = renderFailed(null);
      expect(view.getByRole("textbox")).toHaveValue("K");
      expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
      try {
        activeAccount.username = "other";
        view.rerenderFailed(null);
        type(view.getByRole, "");
        activeAccount.username = "tester";
        view.rerenderFailed(null);

        expect(view.getByRole("textbox")).toHaveValue("");
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "false");
        type(view.getByRole, "a brand new reply");
        await act(async () => {
          fireEvent.click(view.getByRole("button", { name: "Reply" }));
        });
        expect(view.onSubmit).toHaveBeenCalledWith("a brand new reply", { declinePayout: false });
      } finally {
        activeAccount.username = "tester";
      }
    });

    // The form already holds the kept text at the switch: nothing has to land, so
    // the kept copy goes at once, and a posted reply does not come back as a draft.
    test("a kept reply already in the form is cleared at the switch, not brought back after posting", async () => {
      activeAccount.username = "other";
      try {
        const view = renderFailed(null);
        type(view.getByRole, "K");
        window.localStorage.setItem("ecency_reply_failed_text_tester_alice_post-1", JSON.stringify("K"));
        window.localStorage.setItem("ecency_reply_failed_decline_tester_alice_post-1", JSON.stringify("K"));

        activeAccount.username = "tester";
        view.rerenderFailed(null);
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
        expect(window.localStorage.getItem("ecency_reply_failed_text_tester_alice_post-1")).toBeNull();
      } finally {
        activeAccount.username = "tester";
      }
    });

    // Greptile (#2106): another account's held failure must not stop this account's
    // kept declined reply from coming back checked.
    test("a kept declined reply comes back checked while another account's failure is held", () => {
      const othersFailure = { text: "other's failed", declinePayout: false, username: "other" };
      activeAccount.username = "other";
      try {
        const view = renderFailed(othersFailure);
        type(view.getByRole, "");
        window.localStorage.setItem("ecency_reply_failed_text_tester_alice_post-1", JSON.stringify("K"));
        window.localStorage.setItem("ecency_reply_failed_decline_tester_alice_post-1", JSON.stringify("K"));

        activeAccount.username = "tester";
        view.rerenderFailed(othersFailure);
        expect(view.getByRole("textbox")).toHaveValue("K");
        expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
      } finally {
        activeAccount.username = "tester";
      }
    });

    // CodeRabbit (#2106): the edit form is not a reply form; a post body equal to
    // a kept failed reply must not consume it.
    test("an edit form whose body equals a kept failed reply leaves it for the reply form", () => {
      window.localStorage.setItem("ecency_reply_failed_text_tester_alice_post-1", JSON.stringify("K"));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <Comment entry={{ ...entry, body: "K" } as Entry} onSubmit={vi.fn()} submitText="Update" isEdit />
        </QueryClientProvider>
      ).unmount();

      expect(window.localStorage.getItem("ecency_reply_failed_text_tester_alice_post-1")).toBe(JSON.stringify("K"));
      expect(renderComment().getByRole("textbox")).toHaveValue("K");
    });

    // Fable (#2106): a declined reply that fails at once can come back in the same
    // render as the form's own clear; the restore's stored decline must survive it.
    test("a failure landing in the same render as the submit's clear keeps its decline", async () => {
      const view = renderFailed(null);
      type(view.getByRole, "T");
      fireEvent.click(checkbox(view.getByRole));
      await act(async () => {
        fireEvent.click(view.getByRole("button", { name: "Reply" }));
        view.rerenderFailed({ text: "T", declinePayout: true });
      });

      expect(view.getByRole("textbox")).toHaveValue("T");
      expect(checkbox(view.getByRole)).toHaveAttribute("aria-checked", "true");
      expect(window.localStorage.getItem("ecency_reply_failed_decline_tester_alice_post-1")).toBe(JSON.stringify("T"));
    });

    // The form's first text is a held failure only when it is this account's.
    test("a held failure of another account does not seed this account's form", () => {
      const view = renderFailed({ text: "B text", declinePayout: false, username: "other" });
      expect(view.getByRole("textbox")).toHaveValue("");
    });

    test("several edits in a row keep the decline in step with the draft", () => {
      const failed = renderFailed({ text: "one", declinePayout: true });
      type(failed.getByRole, "one two");
      type(failed.getByRole, "one two three");
      failed.unmount();

      expect(checkbox(renderComment().getByRole)).toHaveAttribute("aria-checked", "true");
    });

    test("typing in the edit form of the same post leaves a pending reply decline alone", () => {
      renderFailed({ text: "hello world", declinePayout: true }).unmount();
      const keys = declineKeys();
      expect(keys).not.toEqual([]);

      const editing = renderComment(undefined, { isEdit: true });
      type(editing.getByRole, "an edit of the post itself");
      editing.unmount();

      expect(declineKeys()).toEqual(keys);
      expect(window.localStorage.getItem(keys[0])).toBe(JSON.stringify("hello world"));
    });

    test("opening the edit form of the same post keeps the unsent reply draft", () => {
      const reply = renderComment();
      type(reply.getByRole, "my unsent reply");
      reply.unmount();

      renderComment(undefined, { isEdit: true }).unmount();

      expect(renderComment().getByRole("textbox")).toHaveValue("my unsent reply");
    });

    test("an edited declined reply posts declined and leaves nothing stored", async () => {
      const failed = renderFailed({ text: "hello wrold", declinePayout: true });
      type(failed.getByRole, "hello world");
      await act(async () => {
        fireEvent.click(failed.getByRole("button", { name: "Reply" }));
      });

      expect(failed.onSubmit).toHaveBeenCalledWith("hello world", { declinePayout: true });
      expect(declineKeys()).toEqual([]);
    });

    test("a failed reply that kept its payout stores nothing", () => {
      renderFailed({ text: "hello world", declinePayout: false });
      expect(declineKeys()).toEqual([]);
    });

    test("is not offered when editing, since comment_options cannot be set again", () => {
      const { queryByRole } = renderComment(undefined, { isEdit: true });

      expect(queryByRole("checkbox", { name: "comment.decline-payout" })).toBeNull();
    });
  });
});
