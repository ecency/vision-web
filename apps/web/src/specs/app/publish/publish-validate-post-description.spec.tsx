import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { postBodySummary } from "@ecency/render-helper";
import { SUBMIT_DESCRIPTION_MAX_LENGTH } from "@/app/submit/_consts";
import { useActiveAccount } from "@/core/hooks/use-active-account";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
// The component reads publish state through the hooks barrel. Hand back the real state
// module only, so the editor and dictation hooks in that barrel are not loaded.
vi.mock("@/app/publish/_hooks", async () =>
  vi.importActual("@/app/publish/_hooks/use-publish-state")
);
// The broadcast hooks only need to exist: nothing here publishes.
const publishApi = vi.hoisted(() => ({ publish: vi.fn(async () => []) }));
vi.mock("@/app/publish/_api", () => ({
  usePublishApi: () => ({ mutateAsync: publishApi.publish, isPending: false }),
  useScheduleApi: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveDraftApi: () => ({ mutateAsync: vi.fn() }),
  useSaveTemplateApi: () => ({ mutateAsync: vi.fn(), isPending: false })
}));
vi.mock("@/app/publish/_components/publish-action-bar-community", () => ({
  PublishActionBarCommunity: () => null
}));
vi.mock("@/app/publish/_components/publish-validate-post-thumbnail-picker", () => ({
  PublishValidatePostThumbnailPicker: () => null
}));
vi.mock("@/app/publish/_components/publish-schedule-dialog", () => ({
  PublishScheduleDialog: () => null
}));
vi.mock("@/app/submit/_components", () => ({
  TagSelector: () => null,
  sanitizeTagInput: (tag: string) => tag.toLowerCase()
}));
vi.mock("@/features/shared/rc-topup/use-rc-topup-action", () => ({
  useRcTopupAction: () => ({ openTopup: vi.fn(), dialog: null })
}));
vi.mock("@/features/shared/points-topup-cta", () => ({ PointsTopupCta: () => null }));
vi.mock("@/features/shared/rc-precheck", () => ({ RcPrecheckBanner: () => null }));
vi.mock("@/features/shared", () => ({
  handleAndReportError: vi.fn(() => true),
  error: vi.fn(),
  AvailableCredits: () => null
}));
vi.mock("@/features/support-ecency", () => ({
  canFitBeneficiary: () => false,
  isSupportEcencyRow: () => false,
  SUPPORT_ECENCY_ACCOUNT: "ecency",
  SUPPORT_ECENCY_DEFAULT_PERCENT: 1,
  useSupportEcencySettingsQuery: () => ({ data: undefined })
}));
vi.mock("@/app/publish/_utils/rc-shortfall", () => ({
  isShortfallStillRelevant: () => false,
  resolveRcShortfall: () => null
}));
// jsdom never fires Image.onload, so the image ratio probe would never settle.
vi.mock("@/features/entry-management/entry-metadata-manager/get-dimensions-from-data-url", () => ({
  getDimensionsFromDataUrl: async () => [0, 0]
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/publish",
  useSearchParams: () => null
}));

import { PublishStateProvider, usePublishState } from "@/app/publish/_hooks/use-publish-state";
import { PublishValidatePost } from "@/app/publish/_components/publish-validate-post";
import { error as feedbackError } from "@/features/shared";
import { renderWithQueryClient } from "@/specs/test-utils";

function renderComposer() {
  const state: { current: ReturnType<typeof usePublishState> | null } = { current: null };
  function Harness({ step }: { step: "edit" | "validation" }) {
    state.current = usePublishState();
    return step === "validation" ? (
      <PublishValidatePost onClose={() => {}} onSuccess={() => {}} />
    ) : null;
  }
  const tree = (step: "edit" | "validation") => (
    <PublishStateProvider>
      <Harness step={step} />
    </PublishStateProvider>
  );
  const { rerender } = renderWithQueryClient(tree("edit"));
  return { state, rerender, tree };
}

// An image only body: the summariser returns nothing for it, which is the case the
// validation step used to repair.
const IMAGE_BODY = "<center>![](https://i.ecency.com/DQmX/a.png)</center>";
const REWRITTEN = "Let me tell you a story about O.\n\nO is short for Orchestrator.";

const summaryOf = (content: string) => postBodySummary(content, SUBMIT_DESCRIPTION_MAX_LENGTH);

// Regression: the validation step generated a description and wrote it back as though the
// author had typed it, so a body edited afterwards published the older text.
describe("publish validation step description", () => {
  beforeEach(() => {
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "author" },
      username: "author",
      account: { name: "author", post_count: 10 },
      isLoading: false
    } as unknown as ReturnType<typeof useActiveAccount>);
  });

  it("keeps following the body after the validation step has been open", () => {
    const state: { current: ReturnType<typeof usePublishState> | null } = { current: null };
    function Harness({ step }: { step: "edit" | "validation" }) {
      state.current = usePublishState();
      return step === "validation" ? (
        <PublishValidatePost onClose={() => {}} onSuccess={() => {}} />
      ) : null;
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (step: "edit" | "validation") => (
      <QueryClientProvider client={queryClient}>
        <PublishStateProvider>
          <Harness step={step} />
        </PublishStateProvider>
      </QueryClientProvider>
    );

    const { rerender } = render(tree("edit"));
    act(() => state.current!.setTitle("A photo"));
    act(() => state.current!.setContent(IMAGE_BODY));

    // Continue, then back to the editor, then rewrite the post and continue again.
    rerender(tree("validation"));
    rerender(tree("edit"));
    act(() => state.current!.setContent(REWRITTEN));
    rerender(tree("validation"));

    expect(state.current!.metaDescription).toBe(summaryOf(REWRITTEN));
  });

  // Hashtags lifted from the body skipped the tag rules the selector applies.
  it("adds only the body hashtags the tag rules accept", () => {
    const { state, rerender, tree } = renderComposer();
    act(() => state.current!.setTags([]));
    act(() =>
      state.current!.setContent(
        "Trip #travel #my-first-post #2026recap #photo-walk #cryptocurrencytradinganalysis"
      )
    );
    rerender(tree("validation"));

    expect(state.current!.tags).toEqual(["travel", "photo-walk"]);
  });
});

describe("publish validation step tag check", () => {
  beforeEach(() => {
    publishApi.publish.mockClear();
    vi.mocked(feedbackError).mockClear();
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "author" },
      username: "author",
      account: { name: "author", post_count: 10 },
      isLoading: false
    } as unknown as ReturnType<typeof useActiveAccount>);
  });

  function openWithTags(tags: string[], loadedDraftTags: string[] = []) {
    const composer = renderComposer();
    act(() => composer.state.current!.setTitle("A title"));
    act(() => composer.state.current!.setContent("Some words about travel."));
    act(() => composer.state.current!.setTags(tags));
    act(() => composer.state.current!.setLoadedDraftTags(loadedDraftTags));
    composer.rerender(composer.tree("validation"));
    return composer;
  }

  it("refuses to publish a tag the rules reject", async () => {
    openWithTags(["travel", "2026recap"]);

    await act(async () => fireEvent.click(screen.getByText("publish.publish-now")));

    expect(publishApi.publish).not.toHaveBeenCalled();
    expect(feedbackError).toHaveBeenCalledWith("tag-selector.limited_firstchar");
  });

  // Drafts are shared with mobile, which accepts tags such as 3speak.
  it("publishes the tags the draft was opened with", async () => {
    openWithTags(["travel", "3speak"], ["travel", "3speak"]);

    await act(async () => fireEvent.click(screen.getByText("publish.publish-now")));

    expect(feedbackError).not.toHaveBeenCalled();
    expect(publishApi.publish).toHaveBeenCalled();
  });

  // The step rewrites loaded tags on mount (lowercase, charset, length), so the
  // snapshot has to be compared in that form or the tag loses its exemption.
  it("keeps a draft tag exempt after the step normalises it", async () => {
    openWithTags(["travel", "Photo-"], ["travel", "Photo-"]);

    await act(async () => fireEvent.click(screen.getByText("publish.publish-now")));

    expect(feedbackError).not.toHaveBeenCalled();
    expect(publishApi.publish).toHaveBeenCalled();
  });

  it("drops the draft exemption when the composer is cleared", () => {
    const { state } = openWithTags(["travel"], ["3speak"]);

    act(() => state.current!.clearAll());

    expect(state.current!.loadedDraftTags).toEqual([]);
  });
});
