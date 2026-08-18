import { vi } from "vitest";
import React from "react";
import { fireEvent, render } from "@testing-library/react";
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

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "tester" } })
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
vi.mock("@/utils", () => ({
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

function renderComment(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <Comment entry={entry} onSubmit={onSubmit} submitText="Reply" />
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

    expect(onSubmit).toHaveBeenCalledWith("hello world");
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
});
