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

const pressCtrlK = () =>
  act(() => {
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  });

describe("ChatsClient New chat flow", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.clearAllMocks();
    routeParams = {};
    search = new URLSearchParams();
    onScreen = true;
    bootstrapResult = { data: { ok: true }, isLoading: false, error: null };
    channelList = [];
    foundUsers = [];
    directMutation.error = null;
    joinMutation.error = null;
    // jsdom has no layout; report the client's root as on screen or hidden.
    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
      () => ({ length: onScreen ? 1 : 0 }) as DOMRectList
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens from the New chat button and resets mutation errors on close", () => {
    render(<ChatsClient />);
    fireEvent.click(screen.getByLabelText("chat.new-chat"));
    expect(screen.getByLabelText("chat.search-chats")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("g.close"));
    expect(joinMutation.reset).toHaveBeenCalled();
    expect(directMutation.reset).toHaveBeenCalled();
  });

  it("opens on Ctrl+K when the list is on screen", () => {
    render(<ChatsClient />);
    pressCtrlK();
    expect(screen.getByLabelText("chat.search-chats")).toBeInTheDocument();
  });

  it("ignores Ctrl+K in a hidden instance on /chats, leaving it to the visible one", () => {
    onScreen = false;
    render(<ChatsClient />);
    pressCtrlK();
    expect(screen.queryByLabelText("chat.search-chats")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("sends Ctrl+K on a mobile channel page to the list on /chats", () => {
    onScreen = false;
    routeParams = { id: "c1" };
    render(<ChatsClient />);
    pressCtrlK();
    expect(push).toHaveBeenCalledWith("/chats?search=1");
  });

  it("opens from ?search=1 and drops the param", () => {
    search = new URLSearchParams("search=1");
    render(<ChatsClient />);
    expect(screen.getByLabelText("chat.search-chats")).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/chats");
  });

  it("still lists a DM partner the local filter cannot match", () => {
    channelList = [
      {
        id: "dm1",
        name: "me__john",
        type: "D",
        display_name: "",
        directUser: { id: "u1", username: "john", first_name: "John", last_name: "Doe", nickname: "jd" }
      }
    ];
    foundUsers = [{ id: "u1", username: "john", first_name: "John", last_name: "Doe", nickname: "jd" }];
    render(<ChatsClient />);
    fireEvent.click(screen.getByLabelText("chat.new-chat"));
    fireEvent.change(screen.getByLabelText("chat.search-chats"), { target: { value: "jd" } });

    // In People, ready to open the existing DM (the sidebar row also shows @john).
    expect(screen.getByRole("button", { name: /@john.*chat\.start-dm-button/ })).toBeInTheDocument();
    expect(screen.queryByText("chat.no-search-results")).not.toBeInTheDocument();
  });

  it("shows a failed ?dm start in the sidebar while the modal is closed", () => {
    directMutation.error = new Error("User is not on chat");
    render(<ChatsClient />);
    expect(screen.getByRole("alert")).toHaveTextContent("User is not on chat");
  });

  it("shows a failed bootstrap refetch once data is cached", () => {
    bootstrapResult = { data: { ok: true }, isLoading: false, error: new Error("Refetch failed") };
    render(<ChatsClient />);
    expect(screen.getByRole("alert")).toHaveTextContent("Refetch failed");
  });
});
