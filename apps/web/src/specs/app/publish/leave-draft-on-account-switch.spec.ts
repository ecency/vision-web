import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// #2105: the draft editor route edits a draft that belongs to the account that
// opened it. When the signed-in account changes, the page leaves for a fresh
// /publish composer instead of saving the next account's edits into that draft.
const activeUsername = vi.hoisted(() => ({ current: undefined as string | undefined }));
vi.mock("@/core/hooks/use-active-username", () => ({
  useActiveUsername: () => activeUsername.current
}));

const { useLeaveDraftOnAccountSwitch } = await import(
  "@/app/publish/_hooks/use-leave-draft-on-account-switch"
);

function setup(initial: string | undefined, loaded = true) {
  activeUsername.current = initial;
  const onLeave = vi.fn();
  const view = renderHook(({ active }: { active: boolean }) => useLeaveDraftOnAccountSwitch(onLeave, active), {
    initialProps: { active: loaded }
  });
  let active = loaded;
  const switchTo = (next: string | undefined) => {
    activeUsername.current = next;
    act(() => view.rerender({ active }));
  };
  const load = () => {
    active = true;
    act(() => view.rerender({ active }));
  };
  return { onLeave, switchTo, load };
}

describe("useLeaveDraftOnAccountSwitch", () => {
  beforeEach(() => {
    activeUsername.current = undefined;
  });

  it("leaves when another account signs in", () => {
    const { onLeave, switchTo } = setup("alice");
    switchTo("bob");
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("stays for the account that opened the draft", () => {
    const { onLeave, switchTo } = setup("alice");
    switchTo("alice");
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("takes the first signed-in account as the owner when the session loads late", () => {
    const { onLeave, switchTo } = setup(undefined);
    switchTo("alice");
    expect(onLeave).not.toHaveBeenCalled();
    switchTo("bob");
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("does not leave on a sign-out and back in as the same account", () => {
    const { onLeave, switchTo } = setup("alice");
    switchTo(undefined);
    switchTo("alice");
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("leaves when a different account signs in after a sign-out", () => {
    const { onLeave, switchTo } = setup("alice");
    switchTo(undefined);
    switchTo("bob");
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  // Fable (#2105 review): a draft that did not load for the first account (it
  // belongs to another one) is reloaded by the page for the next account. Only
  // a loaded draft has an owner to leave.
  it("does not leave while the draft has not loaded, and owns it to the account it loads for", () => {
    const { onLeave, switchTo, load } = setup("alice", false);
    switchTo("bob");
    expect(onLeave).not.toHaveBeenCalled();
    load();
    switchTo("bob");
    expect(onLeave).not.toHaveBeenCalled();
    switchTo("alice");
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("leaves only once", () => {
    const { onLeave, switchTo } = setup("alice");
    switchTo("bob");
    switchTo("carol");
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
