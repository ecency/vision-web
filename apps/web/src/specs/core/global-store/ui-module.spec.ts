import { describe, it, expect, vi } from "vitest";
import { createUiActions, createUiState } from "@/core/global-store/modules/ui-module";

/**
 * The store write itself is what fans out: zustand's set() builds a new state object
 * and notifies every subscriber, so re-writing a value the store already holds costs a
 * full selector pass across ~130 call sites and can feed a commit→write→commit loop
 * (ECENCY-NEXT-1GJW, issue #1432). These specs pin the writes as idempotent.
 */
function setup(initial: Partial<ReturnType<typeof createUiState>> = {}) {
  const state = { ...createUiState(), ...initial };
  const set = vi.fn((patch: Partial<typeof state>) => Object.assign(state, patch));
  const actions = createUiActions(set, () => state);
  return { state, set, actions };
}

describe("ui-module — writes are idempotent", () => {
  it("does not call set() when toggleUiProp is given the value already held", () => {
    const { set, actions } = setup({ uiNotifications: false });
    actions.toggleUiProp("notifications", false);
    expect(set).not.toHaveBeenCalled();
  });

  it("does not call set() when setLogin is given the value already held", () => {
    const { set, actions } = setup({ login: false });
    actions.setLogin(false);
    expect(set).not.toHaveBeenCalled();
  });

  it("does not call set() for a redundant login write via toggleUiProp", () => {
    const { set, actions } = setup({ login: true });
    actions.toggleUiProp("login", true);
    expect(set).not.toHaveBeenCalled();
  });
});

describe("ui-module — real changes still write", () => {
  it("writes when toggleUiProp flips notifications on", () => {
    const { state, set, actions } = setup({ uiNotifications: false });
    actions.toggleUiProp("notifications", true);
    expect(set).toHaveBeenCalledWith({ uiNotifications: true });
    expect(state.uiNotifications).toBe(true);
  });

  it("toggles notifications when no explicit value is given", () => {
    const { state, set, actions } = setup({ uiNotifications: false });
    actions.toggleUiProp("notifications");
    expect(state.uiNotifications).toBe(true);
    actions.toggleUiProp("notifications");
    expect(state.uiNotifications).toBe(false);
    expect(set).toHaveBeenCalledTimes(2);
  });

  it("writes when setLogin changes the value", () => {
    const { state, set, actions } = setup({ login: false });
    actions.setLogin(true);
    expect(set).toHaveBeenCalledWith({ login: true });
    expect(state.login).toBe(true);
  });

  it("leaves the sibling flag untouched", () => {
    const { state, actions } = setup({ login: true, uiNotifications: false });
    actions.toggleUiProp("notifications", true);
    expect(state.login).toBe(true);
  });
});
