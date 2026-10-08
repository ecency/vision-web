import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLookup = vi.fn();
const mockIsMember = vi.fn();
const mockEnsureTeam = vi.fn();
const mockEnsureChannel = vi.fn();
const mockCheckDmFanout = vi.fn();

vi.mock("@/server/mattermost", () => ({
  lookupMattermostUser: (...args: unknown[]) => mockLookup(...args),
  isUserInChannel: (...args: unknown[]) => mockIsMember(...args),
  ensureUserInTeam: (...args: unknown[]) => mockEnsureTeam(...args),
  ensureUserInChannel: (...args: unknown[]) => mockEnsureChannel(...args)
}));

vi.mock("@/server/chat-dm-fanout", () => ({
  checkDmFanout: (...args: unknown[]) => mockCheckDmFanout(...args)
}));

import { addMentionedUsersToChannel, MAX_MENTION_JOINS } from "@/server/chat-mentions";

const user = (username: string, extra: Record<string, unknown> = {}) => ({
  id: `id-${username}`,
  username,
  email: "",
  delete_at: 0,
  ...extra
});

const base = { channelId: "chan", senderId: "id-sender", senderCreatedAt: 1 };

describe("addMentionedUsersToChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookup.mockImplementation(async (username: string) => user(username));
    mockIsMember.mockResolvedValue(false);
    mockCheckDmFanout.mockResolvedValue({ allowed: true, recipients: 1, limit: 20, retryAfterSeconds: 0 });
  });

  it("adds a mentioned non-member and counts them as a recipient", async () => {
    const result = await addMentionedUsersToChannel({ ...base, usernames: ["alice"] });

    expect(mockCheckDmFanout).toHaveBeenCalledWith({
      userId: "id-sender",
      recipients: ["id-alice"],
      accountCreatedAt: 1,
      scope: "mention"
    });
    expect(mockEnsureChannel).toHaveBeenCalledWith("id-alice", "chan");
    expect(result).toEqual({ added: ["id-alice"] });
  });

  it("never provisions an account for a username that is not on chat", async () => {
    mockLookup.mockResolvedValue(null);

    const result = await addMentionedUsersToChannel({ ...base, usernames: ["nobody"] });

    expect(result).toEqual({ added: [] });
    expect(mockCheckDmFanout).not.toHaveBeenCalled();
    expect(mockEnsureTeam).not.toHaveBeenCalled();
    expect(mockEnsureChannel).not.toHaveBeenCalled();
  });

  it("does not reactivate a deactivated account", async () => {
    mockLookup.mockResolvedValue(user("gone", { delete_at: 123 }));

    const result = await addMentionedUsersToChannel({ ...base, usernames: ["gone"] });

    expect(result).toEqual({ added: [] });
    expect(mockEnsureChannel).not.toHaveBeenCalled();
  });

  it("skips existing members and the sender, without counting them", async () => {
    mockIsMember.mockImplementation(async (id: string) => id === "id-member");
    mockLookup.mockImplementation(async (username: string) =>
      username === "me" ? user("me", { id: "id-sender" }) : user(username)
    );

    await addMentionedUsersToChannel({ ...base, usernames: ["member", "me", "newcomer"] });

    expect(mockCheckDmFanout.mock.calls[0][0].recipients).toEqual(["id-newcomer"]);
    expect(mockEnsureChannel).toHaveBeenCalledTimes(1);
  });

  it("adds nobody when the batch is over the fan-out limit", async () => {
    mockCheckDmFanout.mockResolvedValue({ allowed: false, recipients: 20, limit: 20, retryAfterSeconds: 60 });

    const result = await addMentionedUsersToChannel({ ...base, usernames: ["a1a", "b2b"] });

    expect(result).toEqual({ added: [], limited: true });
    expect(mockEnsureTeam).not.toHaveBeenCalled();
    expect(mockEnsureChannel).not.toHaveBeenCalled();
  });

  it("looks at no more than the first MAX_MENTION_JOINS mentions", async () => {
    const usernames = Array.from({ length: MAX_MENTION_JOINS + 5 }, (_, i) => `user${i}`);

    await addMentionedUsersToChannel({ ...base, usernames });

    expect(mockLookup).toHaveBeenCalledTimes(MAX_MENTION_JOINS);
    expect(mockCheckDmFanout.mock.calls[0][0].recipients).toHaveLength(MAX_MENTION_JOINS);
  });

  it("drops a mention whose lookup fails instead of guessing", async () => {
    mockLookup.mockImplementation(async (username: string) => {
      if (username === "flaky") throw new Error("upstream 500");
      return user(username);
    });
    mockIsMember.mockImplementation(async (id: string) => {
      if (id === "id-unknown") throw new Error("upstream 500");
      return false;
    });

    const result = await addMentionedUsersToChannel({
      ...base,
      usernames: ["flaky", "unknown", "fine"]
    });

    expect(mockCheckDmFanout.mock.calls[0][0].recipients).toEqual(["id-fine"]);
    expect(result).toEqual({ added: ["id-fine"] });
  });
});
