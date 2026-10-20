import { ConfigManager, QueryKeys } from "@/modules/core";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { nextRelation, syncMutedUsersCache } from "./relation-toggle";

const KEY = QueryKeys.accounts.mutedUsers("alice");

describe("syncMutedUsersCache", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient();
    ConfigManager.setQueryClient(client);
  });

  it("removes an unmuted author", () => {
    client.setQueryData(KEY, ["bob", "spam"]);
    syncMutedUsersCache("alice", "spam", false);
    expect(client.getQueryData(KEY)).toEqual(["bob"]);
  });

  it("adds a muted author once", () => {
    client.setQueryData(KEY, ["bob", "spam"]);
    syncMutedUsersCache("alice", "spam", true);
    syncMutedUsersCache("alice", "carol", true);
    expect(client.getQueryData(KEY)).toEqual(["bob", "spam", "carol"]);
  });

  it("leaves a list that was never fetched alone", () => {
    syncMutedUsersCache("alice", "spam", true);
    expect(client.getQueryData(KEY)).toBeUndefined();
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
