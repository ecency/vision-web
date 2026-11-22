import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
vi.mock("@/app/publish/_hooks", async () =>
  vi.importActual("@/app/publish/_hooks/use-publish-state")
);
const publishApi = vi.hoisted(() => ({ publish: vi.fn() }));
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
vi.mock("@/features/entry-management/entry-metadata-manager/get-dimensions-from-data-url", () => ({
  getDimensionsFromDataUrl: async () => [0, 0]
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/publish",
  useSearchParams: () => null
}));
// Tests must never reach production Sentry.
const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { PublishStateProvider, usePublishState } from "@/app/publish/_hooks/use-publish-state";
import { PublishValidatePost } from "@/app/publish/_components/publish-validate-post";
import { renderWithQueryClient } from "@/specs/test-utils";

function openValidationStep() {
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
  act(() => state.current!.setTitle("A title"));
  act(() => state.current!.setContent("Some words about travel."));
  act(() => state.current!.setTags(["travel"]));
  rerender(tree("validation"));
}

// #2196
describe("publish: out-of-RC telemetry", () => {
  beforeEach(() => {
    publishApi.publish.mockReset();
    sentry.captureMessage.mockReset();
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "author" },
      username: "author",
      account: { name: "author", post_count: 10 },
      isLoading: false
    } as unknown as ReturnType<typeof useActiveAccount>);
  });

  it("reports a publish rejected for RC once, as a post by the author", async () => {
    publishApi.publish.mockRejectedValue(
      new Error("Account: author has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.")
    );
    openValidationStep();

    await act(async () => fireEvent.click(screen.getByText("publish.publish-now")));

    expect(publishApi.publish).toHaveBeenCalled();
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith("rc-shortfall", {
      level: "info",
      fingerprint: ["rc-shortfall"],
      tags: { "rc.stage": "rejected", "rc.op": "post" },
      user: { username: "author" }
    });
  });

  it("sends nothing when the publish fails for another reason", async () => {
    publishApi.publish.mockRejectedValue(new Error("Missing Posting Authority author"));
    openValidationStep();

    await act(async () => fireEvent.click(screen.getByText("publish.publish-now")));

    expect(publishApi.publish).toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});
