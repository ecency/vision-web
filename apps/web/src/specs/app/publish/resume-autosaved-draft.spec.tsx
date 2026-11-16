import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readAutosavePointer,
  writeAutosavePointer
} from "@/app/publish/_utils/autosave-pointer";

const push = vi.hoisted(() => vi.fn());
const drafts = vi.hoisted(() => ({ current: [] as Array<{ _id: string }> }));
const hasToken = vi.hoisted(() => ({ current: true }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

vi.mock("@ecency/sdk", () => ({
  getDraftsQueryOptions: (username?: string) => ({
    queryKey: ["drafts", username],
    // Mirrors the SDK: without a token the queryFn resolves [] and the query is disabled.
    queryFn: async () => (hasToken.current ? drafts.current : []),
    enabled: !!username && hasToken.current
  })
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ username: "alice", activeUser: { username: "alice" } })
}));

const { useResumeAutosavedDraft } = await import(
  "@/app/publish/_hooks/use-resume-autosaved-draft"
);

type Props = { composerEmpty: boolean; draftId?: string };

function render(initialProps: Props = { composerEmpty: true }, client?: QueryClient) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook((props: Props) => useResumeAutosavedDraft(props), {
    wrapper,
    initialProps
  });
}

describe("useResumeAutosavedDraft", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockReset();
    drafts.current = [{ _id: "d1" }, { _id: "d2" }];
    hasToken.current = true;
  });

  it("offers the draft the previous session autosaved into", async () => {
    writeAutosavePointer("alice", "d1", 1234);

    const { result } = render();

    await waitFor(() => expect(result.current.prompt).toEqual({ id: "d1", savedAt: 1234 }));
  });

  it("offers nothing without a pointer", async () => {
    const { result } = render();

    // let the drafts query settle
    await act(async () => {});
    expect(result.current.prompt).toBeUndefined();
  });

  // The draft was deleted elsewhere (drafts list, mobile). A prompt for it would
  // resume into "no draft found", and the stale pointer would keep coming back.
  it("drops a pointer whose draft no longer exists", async () => {
    writeAutosavePointer("alice", "gone", 1234);

    const { result } = render();

    await waitFor(() => expect(readAutosavePointer("alice")).toBeUndefined());
    expect(result.current.prompt).toBeUndefined();
  });

  // Without a token the drafts list cannot be read. That proves nothing about
  // the draft, so the pointer has to survive for a later visit.
  it("keeps the pointer while the drafts list cannot be fetched", async () => {
    hasToken.current = false;
    writeAutosavePointer("alice", "d1", 1234);

    const { result } = render();

    // long enough for a query that wrongly ran to settle and clear it
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(result.current.prompt).toBeUndefined();
    expect(readAutosavePointer("alice")).toEqual({ id: "d1", savedAt: 1234 });
  });

  // A drafts list cached earlier in the session (before the pointed draft was
  // created) is not a check against the server. With no token to refetch it,
  // the disabled query still reports success with that old list, which used to
  // read as "the draft is gone" and drop a valid pointer.
  it("keeps the pointer when only an older cached list is available", async () => {
    hasToken.current = false;
    writeAutosavePointer("alice", "d1", 1234);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["drafts", "alice"], [{ _id: "older" }]);

    render({ composerEmpty: true }, client);

    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(readAutosavePointer("alice")).toEqual({ id: "d1", savedAt: 1234 });
  });

  // Content handed in by a wave, a deck thread or a raid report fills the
  // composer on mount. The prompt must not sit over it.
  it("stays hidden when the composer already holds content", async () => {
    writeAutosavePointer("alice", "d1", 1234);

    const { result } = render({ composerEmpty: false });

    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(result.current.prompt).toBeUndefined();
  });

  // Once the writer starts a new post here, resuming would navigate away from it.
  it("goes away for good once the composer gets content", async () => {
    writeAutosavePointer("alice", "d1", 1234);

    const { result, rerender } = render();
    await waitFor(() => expect(result.current.prompt).toBeDefined());

    rerender({ composerEmpty: false });
    expect(result.current.prompt).toBeUndefined();

    // emptied again, e.g. by Clear or after publishing: still not offered
    rerender({ composerEmpty: true });
    expect(result.current.prompt).toBeUndefined();
  });

  it("resume opens the draft editor on that draft", async () => {
    writeAutosavePointer("alice", "d1", 1234);

    const { result } = render();
    await waitFor(() => expect(result.current.prompt).toBeDefined());

    act(() => result.current.resume());

    expect(push).toHaveBeenCalledWith("/publish/drafts/d1");
    // Resumed: the draft is open in its own editor, so a later empty /publish
    // must not offer it again with a stale "from X ago".
    expect(readAutosavePointer("alice")).toBeUndefined();
  });

  // Dismiss is not Discard: the draft stays in the Drafts list, only the
  // prompt and the pointer go, so the next save here starts a new draft.
  it("dismiss hides the prompt and forgets the pointer", async () => {
    writeAutosavePointer("alice", "d1", 1234);

    const { result } = render();
    await waitFor(() => expect(result.current.prompt).toBeDefined());

    act(() => result.current.dismiss());

    expect(result.current.prompt).toBeUndefined();
    expect(readAutosavePointer("alice")).toBeUndefined();
    expect(push).not.toHaveBeenCalled();
  });
});
