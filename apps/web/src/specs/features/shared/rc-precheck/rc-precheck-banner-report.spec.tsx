import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const precheck = vi.hoisted(() => ({ ready: true, willLikelyFail: true }));
vi.mock("@/features/shared/rc-precheck/use-rc-precheck", () => ({
  useRcPrecheck: () => ({ ...precheck })
}));
vi.mock("@/features/shared/rc-topup/use-rc-topup-action", () => ({
  useRcTopupAction: () => ({ openTopup: vi.fn(), dialog: null })
}));
// Tests must never reach production Sentry.
const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { RcPrecheckBanner } from "@/features/shared/rc-precheck/rc-precheck-banner";

function signIn(username: string) {
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: { username },
    username,
    account: { name: username },
    isLoading: false
  } as unknown as ReturnType<typeof useActiveAccount>);
}

const commentPayload = (body: string) => ({
  kind: "comment" as const,
  op: { parent_author: "alice", parent_permlink: "p", author: "x", permlink: "re", title: "", body, json_metadata: "{}" }
});

// #2196: the pre-check warning is counted once per account per page session.
describe("RcPrecheckBanner: out-of-RC telemetry", () => {
  beforeEach(() => {
    sentry.captureMessage.mockReset();
    precheck.ready = true;
    precheck.willLikelyFail = true;
  });

  it("reports once while the author types and the banner re-renders", () => {
    signIn("typist");
    const { rerender, unmount } = render(
      <RcPrecheckBanner operation="comment_operation" payload={commentPayload("h")} />
    );
    rerender(<RcPrecheckBanner operation="comment_operation" payload={commentPayload("he")} />);
    rerender(<RcPrecheckBanner operation="comment_operation" payload={commentPayload("hel")} />);
    unmount();
    // A second composer later in the same page session.
    render(<RcPrecheckBanner operation="comment_operation" payload={commentPayload("hello")} />);

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith("rc-shortfall", {
      level: "info",
      fingerprint: ["rc-shortfall"],
      tags: { "rc.stage": "precheck", "rc.op": "comment" },
      user: { username: "typist" }
    });
  });

  it("tags the operation the banner warns about", () => {
    signIn("voter");
    render(<RcPrecheckBanner operation="vote_operation" compact />);

    expect(sentry.captureMessage).toHaveBeenCalledWith(
      "rc-shortfall",
      expect.objectContaining({ tags: { "rc.stage": "precheck", "rc.op": "vote" } })
    );
  });

  it("tags a top-level post when the caller says so", () => {
    signIn("poster");
    render(<RcPrecheckBanner operation="comment_operation" rcOp="post" />);

    expect(sentry.captureMessage).toHaveBeenCalledWith(
      "rc-shortfall",
      expect.objectContaining({ tags: { "rc.stage": "precheck", "rc.op": "post" } })
    );
  });

  it("reports nothing while RC is sufficient", () => {
    signIn("funded");
    precheck.willLikelyFail = false;
    render(<RcPrecheckBanner operation="comment_operation" />);

    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});
