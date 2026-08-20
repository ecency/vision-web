import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useContentLanguageGate } from "@/features/shared/entry-translate/use-content-language-gate";
import { detectLanguage } from "@/api/translation";

vi.mock("@/api/translation", () => ({
  detectLanguage: vi.fn(async () => [{ language: "da", confidence: 99 }])
}));

vi.mock("franc-min", () => ({
  franc: vi.fn(() => "spa")
}));

// Long enough to clear MIN_DETECT_CHARS after markdown summarization.
const SPANISH_BODY =
  "Este es un texto de prueba lo suficientemente largo para que la deteccion " +
  "de idioma funcione correctamente en la vista completa de la publicacion.";

// useActiveAccount is globally mocked (setup-any-spec) to a logged-out shape;
// tests override the resolved username per case.
function setLoggedIn(username: string | null) {
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: username ? { username } : null,
    username,
    account: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    refetch: vi.fn()
  } as unknown as ReturnType<typeof useActiveAccount>);
}

describe("useContentLanguageGate server /detect gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLoggedIn(null);
  });

  it("does not call /detect for logged-out readers even with serverConfirm", async () => {
    const { result } = renderHook(() =>
      useContentLanguageGate(
        { author: "author1", permlink: "gate-logged-out", body: SPANISH_BODY },
        { serverConfirm: true }
      )
    );

    // Resolves from the franc guess alone (es vs en reader).
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(detectLanguage).not.toHaveBeenCalled();
  });

  it("calls /detect for logged-in readers with serverConfirm", async () => {
    setLoggedIn("alice");

    const { result } = renderHook(() =>
      useContentLanguageGate(
        { author: "author2", permlink: "gate-logged-in", body: SPANISH_BODY },
        { serverConfirm: true }
      )
    );

    await waitFor(() => expect(detectLanguage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).not.toBeNull());
  });

  it("never calls /detect on the feed path regardless of login", async () => {
    setLoggedIn("alice");

    const { result } = renderHook(() =>
      useContentLanguageGate({ author: "author3", permlink: "gate-feed", body: SPANISH_BODY })
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(detectLanguage).not.toHaveBeenCalled();
  });

  it("detects from a slim feed row's card summary when it has no body", async () => {
    const { result } = renderHook(() =>
      useContentLanguageGate({
        author: "author4",
        permlink: "gate-slim-feed",
        body: "",
        json_metadata: { description: SPANISH_BODY }
      })
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(detectLanguage).not.toHaveBeenCalled();
  });

  it("does not let a summary-derived detection stand in for the full post", async () => {
    // Feed card first: detection comes from the card summary only.
    const feed = renderHook(() =>
      useContentLanguageGate({
        author: "author5",
        permlink: "gate-shared-key",
        body: "",
        json_metadata: { description: SPANISH_BODY }
      })
    );
    await waitFor(() => expect(feed.result.current).not.toBeNull());

    // Same post opened for real: the full body must still be detected (and, for a
    // logged-in reader, confirmed by the server) rather than reusing the summary
    // guess, which may be an unrelated description or the title fallback.
    setLoggedIn("alice");
    const post = renderHook(() =>
      useContentLanguageGate(
        { author: "author5", permlink: "gate-shared-key", body: SPANISH_BODY },
        { serverConfirm: true }
      )
    );

    await waitFor(() => expect(detectLanguage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(post.result.current).not.toBeNull());
  });
});
