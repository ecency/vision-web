import { ConfigManager, QueryKeys } from "@/modules/core";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { nextRelation, syncMutedUsersCache } from "./relation-toggle";

const KEY = QueryKeys.accounts.mutedUsers("alice");

describe("syncMutedUsersCache", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient();
    ConfigManager.setQueryClient(client);
  });

  it("removes an unmuted author", async () => {
    client.setQueryData(KEY, ["bob", "spam"]);
    await syncMutedUsersCache("alice", "spam", false);
    expect(client.getQueryData(KEY)).toEqual(["bob"]);
  });

  it("adds a muted author once", async () => {
    client.setQueryData(KEY, ["bob", "spam"]);
    await syncMutedUsersCache("alice", "spam", true);
    await syncMutedUsersCache("alice", "carol", true);
    expect(client.getQueryData(KEY)).toEqual(["bob", "spam", "carol"]);
  });

  it("leaves a list that was never fetched alone", async () => {
    await syncMutedUsersCache("alice", "spam", true);
    expect(client.getQueryData(KEY)).toBeUndefined();
  });

  // A fetch that started before the toggle resolves with the old list; landing
  // it would undo the change the viewer just made.
  it("does not let an older in-flight fetch overwrite the toggle", async () => {
    client.setQueryData(KEY, ["bob", "spam"]);
    let resolveOld!: (list: string[]) => void;
    const inFlight = client
      .fetchQuery({ queryKey: KEY, queryFn: () => new Promise<string[]>((r) => (resolveOld = r)), staleTime: 0 })
      .catch(() => undefined);

    await syncMutedUsersCache("alice", "spam", false);
    resolveOld(["bob", "spam"]);
    await inFlight;

    expect(client.getQueryData(KEY)).toEqual(["bob"]);
  });

  // The refetch can reach a node that has not indexed the unmute yet.
  it("refetches a list whose first fetch was still in flight, keeping the toggle", async () => {
    let calls = 0;
    const queryFn = () => new Promise<string[]>((r) => { calls++; if (calls > 1) r(["bob", "spam"]); });
    const observer = new QueryObserver(client, { queryKey: KEY, queryFn });
    const unsubscribe = observer.subscribe(() => undefined);

    await syncMutedUsersCache("alice", "spam", false);

    expect(calls).toBe(2);
    expect(client.getQueryData(KEY)).toEqual(["bob"]);
    unsubscribe();
  });
});

describe("nextRelation", () => {
  it("mutes and unmutes", () => {
    expect(nextRelation("toggle-ignore", { ignores: false, follows: false })).toMatchObject({ ignores: true, follows: false });
    expect(nextRelation("toggle-ignore", { ignores: true, follows: false })).toMatchObject({ ignores: false, follows: false });
  });

  it("unmutes when following a muted account", () => {
    expect(nextRelation("toggle-follow", { ignores: true, follows: false })).toMatchObject({ ignores: false, follows: true });
  });

  it("unfollows when muting a followed account", () => {
    expect(nextRelation("toggle-ignore", { ignores: false, follows: true })).toMatchObject({ ignores: true, follows: false });
  });

  it("leaves the mute alone on unfollow, and copes with no known relation", () => {
    expect(nextRelation("toggle-follow", { ignores: false, follows: true, blacklists: false })).toEqual({ ignores: false, follows: false, blacklists: false });
    expect(nextRelation("toggle-ignore", undefined)).toEqual({ ignores: true, follows: false });
  });
});
