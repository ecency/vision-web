import { vi } from "vitest";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { setupModalContainers } from "@/specs/test-utils";

const push = vi.fn();
const replace = vi.fn();
let routeParams: { id?: string } = {};
let search = new URLSearchParams();
let onScreen = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useParams: () => routeParams,
  usePathname: () => "/chats",
  useSearchParams: () => search
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));
vi.mock("@/api/queries", () => ({ useHydrated: () => true }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "me" } })
}));
vi.mock("@/features/shared", () => ({ LoginRequired: () => null }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/features/chat/components/channel-avatar", () => ({ ChannelAvatar: () => null }));
vi.mock("@/features/chat/components/new-group-modal", () => ({ NewGroupModal: () => null }));
vi.mock("@/features/chat/components/private-channel-modals", () => ({
  NewPrivateChannelModal: () => null
}));
vi.mock("@/features/chat/components/chat-ban-screen", () => ({ ChatBanScreen: () => null }));
vi.mock("@/features/chat/chat-ban-notice", () => ({ getChatBanInfo: () => null }));

const directMutation = {
  mutate: vi.fn(),
  reset: vi.fn(),
  error: null as Error | null,
  isPending: false
};
const joinMutation = { mutate: vi.fn(), reset: vi.fn(), error: null as Error | null, isPending: false };
const idle = { mutate: vi.fn(), reset: vi.fn(), error: null, isPending: false };
let bootstrapResult: { data: unknown; isLoading: boolean; error: Error | null } = {
  data: { ok: true },
  isLoading: false,
  error: null
};
let channelList: Array<Record<string, unknown>> = [];
let foundUsers: Array<Record<string, unknown>> = [];

vi.mock("@/features/chat/mattermost-api", () => ({
  useMattermostBootstrap: () => ({ ...bootstrapResult, refetch: vi.fn() }),
  useMattermostChannels: () => ({
    data: { channels: channelList },
    isLoading: false,
    error: null
  }),
  useMattermostChannelSearch: () => ({ data: { channels: [] }, isFetching: false, error: null }),
  useMattermostMessageSearch: () => ({ data: { posts: [] }, isFetching: false, error: null }),
  useMattermostUserSearch: () => ({ data: { users: foundUsers }, isFetching: false, error: null }),
  useMattermostDirectChannel: () => directMutation,
  useMattermostJoinChannel: () => joinMutation,
  useMattermostFavoriteChannel: () => idle,
  useMattermostLeaveChannel: () => idle,
  useMattermostMuteChannel: () => idle,
  useMattermostMarkChannelViewed: () => idle,
  useMattermostUnread: () => ({ data: undefined })
}));

import { ChatsClient } from "@/app/chats/_components/chats-client";

const dm = (id: string, username: string, last_post_at = 1) => ({
  id,
  name: `me__${id}`,
  display_name: "",
  type: "D",
  last_post_at,
  directUser: { id: `${username}-id`, username, nickname: "", first_name: "", last_name: "" }
});

const rowTitles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".grid.grid-cols-1.gap-1 > *")).map((row) => row.textContent);

describe("ChatsClient pinned Esie", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.clearAllMocks();
    routeParams = {};
    search = new URLSearchParams();
    onScreen = true;
    bootstrapResult = { data: { ok: true }, isLoading: false, error: null };
    channelList = [];
    foundUsers = [];
    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
      () => ({ length: onScreen ? 1 : 0 }) as DOMRectList
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pins a row that starts the conversation before any exists", () => {
    channelList = [dm("c-alice", "alice")];
    const { container } = render(<ChatsClient />);

    const pinned = container.querySelector("[data-chat-esie-pinned]")!;
    expect(pinned).toHaveAttribute("href", "/chats?dm=esie");
    expect(pinned).toHaveTextContent("chat.esie-title");
    expect(pinned.querySelector("[data-official-badge]")).toBeInTheDocument();
    expect(rowTitles(container)[0]).toContain("chat.esie-title");
    expect(screen.queryByText("chat.no-channels")).not.toBeInTheDocument();
  });

  it("keeps the existing Esie conversation on top, listed once", () => {
    channelList = [dm("c-alice", "alice", 50), dm("c-esie", "esie", 1)];
    const { container } = render(<ChatsClient />);

    expect(container.querySelector("[data-chat-esie-pinned]")).not.toBeInTheDocument();
    const links = Array.from(container.querySelectorAll('a[href^="/chats/"]')).map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/chats/c-esie", "/chats/c-alice"]);
    expect(container.querySelectorAll("[data-official-badge]")).toHaveLength(1);
  });

  it("shows the empty notice under the pinned row when there is nothing else", () => {
    render(<ChatsClient />);
    expect(screen.getByText("chat.no-channels")).toBeInTheDocument();
  });

  it("starts the conversation again on a later link, as the list stays mounted between chats", () => {
    search = new URLSearchParams("dm=esie");
    const { rerender } = render(<ChatsClient />);
    expect(directMutation.mutate).toHaveBeenCalledTimes(1);

    search = new URLSearchParams();
    rerender(<ChatsClient />);
    search = new URLSearchParams("dm=esie");
    rerender(<ChatsClient />);

    expect(directMutation.mutate).toHaveBeenCalledTimes(2);
    expect(directMutation.mutate).toHaveBeenLastCalledWith("esie", expect.anything());
  });
});
