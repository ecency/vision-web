import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";

// The community mute dialog's success toast branched on the menu's `pin` state instead
// of the `mute` flag the dialog reports, so muting a post said "unmuted" (#1973).

const { successMock } = vi.hoisted(() => ({ successMock: vi.fn() }));

vi.mock("@/features/shared/feedback", () => ({ success: successMock }));

// Every lazy modal resolves to a stub; the mute stub exposes buttons that report the
// dialog result the way MuteBtn does (onSuccess(entry, mute)).
vi.mock("next/dynamic", () => ({
  default: () =>
    function DynamicStub(props: any) {
      if (!props.community || !props.onSuccess) return null;
      return (
        <>
          <button onClick={() => props.onSuccess(props.entry, true)}>report-muted</button>
          <button onClick={() => props.onSuccess(props.entry, false)}>report-unmuted</button>
        </>
      );
    }
}));

vi.mock("@/features/shared/entry-menu/menu-items-generator", () => ({
  useMenuItemsGenerator: () => ({
    menuItems: [],
    pin: false,
    unpin: false,
    mute: true,
    setMute: vi.fn(),
    setPin: vi.fn(),
    setUnpin: vi.fn(),
    setPinKey: vi.fn(),
    pinKey: "",
    setCross: vi.fn(),
    setShare: vi.fn(),
    toggleEditHistory: vi.fn(),
    setDelete_: vi.fn(),
    setPromote: vi.fn(),
    setRecommend: vi.fn(),
    setTranslate: vi.fn(),
    setSendNewsletter: vi.fn()
  })
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "mod" }, username: "mod" })
}));

vi.mock("@/core/caches", () => ({
  getCommunityCache: () => ({
    queryKey: ["community-cache", "hive-1"],
    queryFn: async () => ({ name: "hive-1", team: [] })
  }),
  useCommunityPin: () => ({ mutateAsync: vi.fn() })
}));

vi.mock("@/api/mutations", () => ({
  useDeleteComment: () => ({ mutateAsync: vi.fn() }),
  usePinToBlog: () => ({ mutateAsync: vi.fn() })
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() })
}));

import { EntryMenu } from "@/features/shared/entry-menu";

const entry = { author: "alice", permlink: "post", category: "hive-1" } as any;

describe("EntryMenu community mute toast", () => {
  beforeEach(() => successMock.mockClear());

  it("says muted when the dialog muted the post", async () => {
    renderWithQueryClient(<EntryMenu entry={entry} />);
    fireEvent.click(await screen.findByText("report-muted"));
    await waitFor(() => expect(successMock).toHaveBeenCalledTimes(1));
    expect(successMock).toHaveBeenCalledWith("entry-menu.mute-success");
  });

  it("says unmuted when the dialog unmuted the post", async () => {
    renderWithQueryClient(<EntryMenu entry={entry} />);
    fireEvent.click(await screen.findByText("report-unmuted"));
    await waitFor(() => expect(successMock).toHaveBeenCalledTimes(1));
    expect(successMock).toHaveBeenCalledWith("entry-menu.unmute-success");
  });
});
