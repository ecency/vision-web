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
    function renderFailed(failedReply: { text: string; declinePayout: boolean }) {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const ui = (reply: { text: string; declinePayout: boolean }) => (
        <QueryClientProvider client={queryClient}>
          <Comment entry={entry} onSubmit={onSubmit} submitText="Reply" failedReply={reply} />
        </QueryClientProvider>
      );
      const utils = render(ui(failedReply));
      return { ...utils, onSubmit, rerenderFailed: (r: typeof failedReply) => utils.rerender(ui(r)) };
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

    test("editing the failed text forgets the pending decline", () => {
      const failed = renderFailed({ text: "hello world", declinePayout: true });
      type(failed.getByRole, "something else");
      expect(declineKeys()).toEqual([]);
      failed.unmount();

      expect(checkbox(renderComment().getByRole)).toHaveAttribute("aria-checked", "false");
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
