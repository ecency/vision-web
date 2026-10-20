import { describe, it, expect } from "vitest";
import { computeRecoverySubmitState } from "@/app/(dynamicPages)/profile/[username]/permissions/_components/account-recovery-utils";

describe("computeRecoverySubmitState", () => {
  it("hides the Update button when nothing has changed", () => {
    const s = computeRecoverySubmitState({
      newRecoveryAccount: "ecency",
      currentRecoveryAccount: "ecency",
      activeUsername: "alice",
      formInitiated: false
    });
    expect(s.isRecoveryAccountChanged).toBe(false);
    expect(s.showUpdate).toBe(false);
    expect(s.canSubmit).toBe(false);
  });

  it("shows and allows submit for a non-Ecency recovery-account change without the email flow", () => {
    const s = computeRecoverySubmitState({
      newRecoveryAccount: "trustee",
      currentRecoveryAccount: "ecency",
      activeUsername: "alice",
      formInitiated: false
    });
    expect(s.isRecoveryAccountChanged).toBe(true);
    expect(s.showUpdate).toBe(true);
    expect(s.canSubmit).toBe(true);
  });

  it("blocks a self-recovery even when changed (button shown but disabled)", () => {
    const s = computeRecoverySubmitState({
      newRecoveryAccount: "alice",
      currentRecoveryAccount: "ecency",
      activeUsername: "alice",
      formInitiated: false
    });
    expect(s.isSelfRecovery).toBe(true);
    expect(s.showUpdate).toBe(true);
    expect(s.canSubmit).toBe(false);
  });

  it("still shows the button via the Ecency email flow when the account is unchanged", () => {
    const s = computeRecoverySubmitState({
      newRecoveryAccount: "ecency",
      currentRecoveryAccount: "ecency",
      activeUsername: "alice",
      formInitiated: true
    });
    expect(s.showUpdate).toBe(true);
    expect(s.canSubmit).toBe(true);
  });

  // The submit handler (Enter key or button) gates on canSubmit, so these two cases are the
  // regression guard for "an unchanged/self recovery must not open the signing dialog".
  it("keeps canSubmit=false for the two states an Enter-key submit must not pass", () => {
    const unchanged = computeRecoverySubmitState({
      newRecoveryAccount: "ecency",
      currentRecoveryAccount: "ecency",
      activeUsername: "alice",
      formInitiated: false
    });
    const self = computeRecoverySubmitState({
      newRecoveryAccount: "alice",
      currentRecoveryAccount: "ecency",
      activeUsername: "alice",
      formInitiated: false
    });
    expect(unchanged.canSubmit).toBe(false);
    expect(self.canSubmit).toBe(false);
  });

  it("treats an @-prefixed account name identically to the stripped version", () => {
    // Users sometimes type '@melinda010100' — the @ must be stripped before comparing / submitting.
    const withAt = computeRecoverySubmitState({
      newRecoveryAccount: "@melinda010100".replace(/^@+/, ""),
      currentRecoveryAccount: "ecency",
      activeUsername: "alice",
      formInitiated: false
    });
    const withoutAt = computeRecoverySubmitState({
      newRecoveryAccount: "melinda010100",
      currentRecoveryAccount: "ecency",
      activeUsername: "alice",
      formInitiated: false
    });
    expect(withAt.isRecoveryAccountChanged).toBe(true);
    expect(withAt.canSubmit).toBe(true);
    expect(withAt).toEqual(withoutAt);
  });

  it("treats an empty recovery account as no change", () => {
    const s = computeRecoverySubmitState({
      newRecoveryAccount: "",
      currentRecoveryAccount: "ecency",
      activeUsername: "alice",
      formInitiated: false
    });
    expect(s.isRecoveryAccountChanged).toBe(false);
    expect(s.isSelfRecovery).toBe(false);
    expect(s.showUpdate).toBe(false);
  });
});
