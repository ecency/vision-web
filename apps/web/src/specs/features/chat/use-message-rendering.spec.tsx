import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getSafeChatImageUrl, useMessageRendering } from "@/features/chat/hooks/use-message-rendering";

vi.mock("@/features/chat/components/chat-image", () => ({
  ChatImage: ({ src, alt }: { src: string; alt?: string }) => (
    <img data-testid="chat-image" src={src} alt={alt ?? "Shared image"} />
  )
}));

vi.mock("@/features/chat/components/mention-token", () => ({
  MentionToken: ({ username }: { username: string }) => (
    <span data-testid="mention-token">@{username}</span>
  )
}));

vi.mock("@/features/post-renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/post-renderer")>();

  return {
    ...actual,
    HivePostLinkRenderer: ({ link }: { link: string }) => (
      <span data-testid="post-link-card">{link}</span>
    ),
  };
});

describe("useMessageRendering", () => {
  const hookProps = {
    usersById: {},
    usersByUsername: {},
    activeUsername: undefined,
    startDirectMessage: vi.fn(),
    normalizeUsername: vi.fn()
  };

  it("proxies markdown image URLs instead of loading them directly", () => {
    const { result } = renderHook(() => useMessageRendering(hookProps));

    render(<div>{result.current.renderMessageContent("![](https://webhook.site/146b640e-078b-45c4-b0d7-9d197acb90b9/gif)")}</div>);

    const image = screen.getByTestId("chat-image");
    expect(image.getAttribute("src")).toBeTruthy();
    expect(image.getAttribute("src")).toContain("https://i.ecency.com/p/");
    expect(image.getAttribute("src")).not.toContain("webhook.site/146b640e-078b-45c4-b0d7-9d197acb90b9/gif");
  });

  it("drops invalid image sources instead of rendering raw img tags", () => {
    const { result } = renderHook(() => useMessageRendering(hookProps));

    render(<div>{result.current.renderMessageContent("<img src=\"x\" alt=\"x\" />")}</div>);

    expect(screen.queryByTestId("chat-image")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  // Post links from recognized Hive frontends are enhanced into a rich preview
  // rather than left as a bare link whose @author gets split into a mention.
  // Inline code keeps the URL as a text node (linkify does not auto-link inside
  // <code>), which is what exercises the enhancement path.
  it.each([
    "https://snapie.io/@alice/my-post",
    "https://hivesuite.app/@alice/my-post",
    "https://inleo.io/hive/@alice/my-post"
  ])("enhances %s as a Hive post link in chat", (url) => {
    const { result } = renderHook(() => useMessageRendering(hookProps));

    render(<div>{result.current.renderMessageContent(`\`${url}\``)}</div>);

    // getByText throws if the enhanced link isn't rendered as a single node
    expect(screen.getByText(url)).toBeTruthy();
    // recognized as one post link, not split into an @author mention
    expect(screen.queryByText("@alice")).toBeNull();
  });

  // A bare post URL gets auto-linked into an anchor; its @author must stay part
  // of the link, not be peeled off into a clickable chat mention. Covers the
  // existing frontends (peakd) as well as the newly added ones.
  it.each([
    "https://snapie.io/@alice/my-post",
    "https://hivesuite.app/@alice/my-post",
    "https://inleo.io/hive/@alice/my-post",
    "https://peakd.com/@alice/my-post"
  ])("does not split the @author of a bare %s link into a mention", (url) => {
    const { result } = renderHook(() => useMessageRendering(hookProps));

    render(<div>{result.current.renderMessageContent(`see ${url} here`)}</div>);

    expect(screen.queryByTestId("mention-token")).toBeNull();
  });

  // A pasted post link is auto-linked before the text path runs, so the
  // preview has to come from the anchor itself.
  it.each([
    "https://ecency.com/hive-125125/@alice/my-post",
    "https://peakd.com/@alice/my-post",
    "https://hive.blog/@alice/my-post"
  ])("shows a preview card for a pasted %s link", (url) => {
    const { result } = renderHook(() => useMessageRendering(hookProps));

    render(<div>{result.current.renderMessageContent(`look at this ${url}`)}</div>);

    expect(screen.getByTestId("post-link-card").textContent).toBe(url);
  });

  it("keeps a post link with its own wording as a link that opens in a new tab", () => {
    const { result } = renderHook(() => useMessageRendering(hookProps));

    render(
      <div>{result.current.renderMessageContent("[read this](https://ecency.com/@alice/my-post)")}</div>
    );

    expect(screen.queryByTestId("post-link-card")).toBeNull();
    const link = screen.getByText("read this").closest("a");
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("does not preview a profile link", () => {
    const { result } = renderHook(() => useMessageRendering(hookProps));

    render(<div>{result.current.renderMessageContent("https://ecency.com/@alice")}</div>);

    expect(screen.queryByTestId("post-link-card")).toBeNull();
  });

  it("still renders a standalone @mention as a chat mention", () => {
    const { result } = renderHook(() => useMessageRendering(hookProps));

    render(<div>{result.current.renderMessageContent("hello @bob")}</div>);

    expect(screen.getByTestId("mention-token")).toBeTruthy();
  });
});

describe("getSafeChatImageUrl", () => {
  it("returns a proxied URL for absolute http image candidates", () => {
    const proxied = getSafeChatImageUrl("https://webhook.site/146b640e-078b-45c4-b0d7-9d197acb90b9/gif");

    expect(proxied).toContain("https://i.ecency.com/p/");
    expect(proxied).not.toContain("webhook.site/146b640e-078b-45c4-b0d7-9d197acb90b9/gif");
  });

  it("rejects non-http image sources", () => {
    expect(getSafeChatImageUrl("x")).toBeNull();
    expect(getSafeChatImageUrl("javascript:alert(1)")).toBeNull();
  });
});
