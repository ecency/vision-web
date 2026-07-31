import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { MattermostWebSocket } from "@/features/chat/mattermost-websocket";

/**
 * Regression: the realtime unread updater must not grow the badge for channels
 * the unreads route marks ineligible (muted / never-viewed). Otherwise a
 * websocket post to such a channel raises a badge count the channel-list route
 * never shows a row for — a phantom unread the user cannot clear.
 */

const UNREAD_KEY = ["mattermost-unread", "self"];

type UnreadChannel = {
  channelId: string;
  type: string;
  mention_count: number;
  message_count: number;
  thread_unread: number;
  unread_eligible?: boolean;
  unread_emptied?: boolean;
};

function seed(qc: QueryClient, channels: UnreadChannel[]) {
  qc.setQueryData(UNREAD_KEY, {
    channels,
    totalMentions: 0,
    totalDMs: 0,
    totalThreads: 0,
    totalUnread: 0,
    truncated: false
  });
}

function increment(qc: QueryClient, channelId: string) {
  const ws = new MattermostWebSocket().withQueryClient(qc);
  (ws as unknown as { incrementUnreadCount: (id: string) => void }).incrementUnreadCount(channelId);
  return qc.getQueryData<{ channels: UnreadChannel[]; totalDMs: number; totalUnread: number }>(
    UNREAD_KEY
  )!;
}

describe("MattermostWebSocket.incrementUnreadCount — badge eligibility", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient();
  });

  it("grows the badge for an eligible DM", () => {
    seed(qc, [
      { channelId: "dm-1", type: "D", mention_count: 0, message_count: 0, thread_unread: 0, unread_eligible: true }
    ]);
    const data = increment(qc, "dm-1");
    expect(data.channels[0].message_count).toBe(1);
    expect(data.totalDMs).toBe(1);
    expect(data.totalUnread).toBe(1);
  });

  it("does not grow the badge for an ineligible (muted/never-viewed) DM", () => {
    seed(qc, [
      { channelId: "dm-x", type: "D", mention_count: 0, message_count: 0, thread_unread: 0, unread_eligible: false }
    ]);
    const data = increment(qc, "dm-x");
    expect(data.channels[0].message_count).toBe(0);
    expect(data.totalDMs).toBe(0);
    expect(data.totalUnread).toBe(0);
  });

  it("treats a missing unread_eligible flag as eligible (older cached response)", () => {
    seed(qc, [
      { channelId: "dm-legacy", type: "D", mention_count: 0, message_count: 2, thread_unread: 0 }
    ]);
    const data = increment(qc, "dm-legacy");
    expect(data.channels[0].message_count).toBe(3);
    expect(data.totalDMs).toBe(1);
  });

  /**
   * "Every post was deleted" is the one ineligibility that a new post undoes.
   * Patching the cache locally is not enough — the channel-list route hides an
   * emptied DM and a post event does not invalidate that list, so the badge
   * would grow with no row to open. Both queries have to be refetched.
   */
  it("refetches instead of silently dropping a post to an emptied DM", () => {
    const invalidated: unknown[] = [];
    qc.invalidateQueries = ((filters: { queryKey?: unknown }) => {
      invalidated.push(filters?.queryKey);
      return Promise.resolve();
    }) as QueryClient["invalidateQueries"];

    seed(qc, [
      {
        channelId: "dm-emptied",
        type: "D",
        mention_count: 0,
        message_count: 0,
        thread_unread: 0,
        unread_eligible: false,
        unread_emptied: true
      }
    ]);

    const data = increment(qc, "dm-emptied");

    expect(invalidated).toEqual([["mattermost-unread"], ["mattermost-channels"]]);
    // The cache is left untouched — the refetch supplies the truth.
    expect(data.channels[0].message_count).toBe(0);
  });

  it("does not refetch for a muted or never-viewed channel", () => {
    const invalidated: unknown[] = [];
    qc.invalidateQueries = ((filters: { queryKey?: unknown }) => {
      invalidated.push(filters?.queryKey);
      return Promise.resolve();
    }) as QueryClient["invalidateQueries"];

    seed(qc, [
      {
        channelId: "c-muted",
        type: "O",
        mention_count: 0,
        message_count: 0,
        thread_unread: 0,
        unread_eligible: false,
        unread_emptied: false
      }
    ]);

    increment(qc, "c-muted");
    expect(invalidated).toEqual([]);
  });
});
