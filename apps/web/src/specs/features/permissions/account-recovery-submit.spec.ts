import { describe, it, expect } from "vitest";
import {
  computeRecoverySubmitState,
  isValidRecoveryAccount,
  normalizeRecoveryAccount
} from "@/app/(dynamicPages)/profile/[username]/permissions/_components/account-recovery-utils";

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

describe("recovery account input", () => {
  it("strips a leading @, spaces and casing so the chain gets a bare name", () => {
    expect(normalizeRecoveryAccount("@melinda010100")).toBe("melinda010100");
    expect(normalizeRecoveryAccount("  @@Trustee ")).toBe("trustee");
    expect(normalizeRecoveryAccount(undefined)).toBe("");
  });

  it("accepts names typed with @ and rejects names the chain would refuse", () => {
    expect(isValidRecoveryAccount("@melinda010100")).toBe(true);
    expect(isValidRecoveryAccount("good.name")).toBe(true);
    expect(isValidRecoveryAccount("")).toBe(false);
    expect(isValidRecoveryAccount("ab")).toBe(false);
    expect(isValidRecoveryAccount("1abc")).toBe(false);
    expect(isValidRecoveryAccount("bad_name")).toBe(false);
    expect(isValidRecoveryAccount("abc-")).toBe(false);
    expect(isValidRecoveryAccount("a".repeat(17))).toBe(false);
  });

  it("treats @ and case variants of the current or own account as unchanged / self", () => {
    const unchanged = computeRecoverySubmitState({
      newRecoveryAccount: "@Ecency",
      currentRecoveryAccount: "ecency",
      activeUsername: "alice",
      formInitiated: false
    });
    expect(unchanged.showUpdate).toBe(false);

    const self = computeRecoverySubmitState({
      newRecoveryAccount: "@alice",
      currentRecoveryAccount: "ecency",
      activeUsername: "alice",
      formInitiated: false
    });
    expect(self.isSelfRecovery).toBe(true);
    expect(self.canSubmit).toBe(false);
  });
});
