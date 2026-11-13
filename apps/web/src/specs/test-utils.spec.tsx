/**
 * Tests for test utilities
 * This file validates that our test utilities work correctly
 */

import React from "react";
import { screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useQuery } from "@tanstack/react-query";
import {
  renderWithQueryClient,
  createTestQueryClient,
  seedQueryClient,
  mockFullAccount,
  mockEntry,
  mockCommunity,
  mockActiveUser,
  setupModalContainers,
  cleanupModalContainers,
  EntryBuilder,
  AccountBuilder
} from "./test-utils";

// Simple test component that uses React Query
const TestComponent = ({ queryKey }: { queryKey: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => Promise.resolve({ message: "Hello from query" })
  });

  if (isLoading) return <div>Loading...</div>;
  return <div>{data?.message}</div>;
};

describe("Test Utilities", () => {
  describe("QueryClient utilities", () => {
    test("createTestQueryClient creates a QueryClient with correct config", () => {
      const client = createTestQueryClient();
      expect(client).toBeDefined();
      expect(client.getDefaultOptions().queries?.retry).toBe(false);
      expect(client.getDefaultOptions().mutations?.retry).toBe(false);
    });

    test("renderWithQueryClient renders component with QueryClient", async () => {
      renderWithQueryClient(<TestComponent queryKey="test" />);
      expect(await screen.findByText("Hello from query")).toBeInTheDocument();
    });

    test("renderWithQueryClient returns queryClient instance", () => {
      const { queryClient } = renderWithQueryClient(<TestComponent queryKey="test" />);
      expect(queryClient).toBeDefined();
      expect(queryClient.getDefaultOptions().queries?.retry).toBe(false);
    });

    test("seedQueryClient pre-populates query cache", async () => {
      const queryClient = createTestQueryClient();
      seedQueryClient(queryClient, {
        test: { message: "Seeded data" }
      });

      const data = queryClient.getQueryData(["test"]);
      expect(data).toEqual({ message: "Seeded data" });
    });
  });

  describe("Mock data factories", () => {
    test("mockFullAccount creates valid account with defaults", () => {
      const account = mockFullAccount();
      expect(account.name).toBe("testuser");
      expect(account.balance).toBeDefined();
      expect(account.posting).toBeDefined();
      expect(account.profile).toBeDefined();
    });

    test("mockFullAccount accepts overrides", () => {
      const account = mockFullAccount({
        name: "alice",
        reputation: "5000000000",
        balance: "1000.000 HIVE"
      });
      expect(account.name).toBe("alice");
      expect(account.reputation).toBe("5000000000");
      expect(account.balance).toBe("1000.000 HIVE");
    });

    test("mockEntry creates valid entry with defaults", () => {
      const entry = mockEntry();
      expect(entry.author).toBe("testuser");
      expect(entry.title).toBeDefined();
      expect(entry.body).toBeDefined();
      expect(entry.permlink).toBeDefined();
      expect(entry.depth).toBe(0);
    });

    // Issue #2068: entries carry no voter list (bridge v2), so the fixture
    // carries the v2 vote fields instead of active_votes.
    test("mockEntry builds the v2 vote shape without active_votes", () => {
      const entry = mockEntry();
      expect(entry).not.toHaveProperty("active_votes");
      expect(entry.stats.total_votes).toBe(0);
      expect(entry.top_votes).toEqual([]);
      expect(entry.observer_vote).toBeNull();
      expect(entry.observer_vote_for).toBeNull();
    });

    test("mockEntry accepts overrides", () => {
      const entry = mockEntry({
        author: "bob",
        title: "Custom Title",
        parent_author: "alice",
        depth: 1
      });
      expect(entry.author).toBe("bob");
      expect(entry.title).toBe("Custom Title");
      expect(entry.parent_author).toBe("alice");
      expect(entry.depth).toBe(1);
    });

    test("mockCommunity creates valid community with defaults", () => {
      const community = mockCommunity();
      expect(community.name).toBe("hive-123456");
      expect(community.title).toBeDefined();
      expect(community.subscribers).toBeDefined();
      expect(community.team).toBeDefined();
    });

    test("mockCommunity accepts overrides", () => {
      const community = mockCommunity({
        name: "hive-999999",
        title: "Test Community",
        is_nsfw: true
      });
      expect(community.name).toBe("hive-999999");
      expect(community.title).toBe("Test Community");
      expect(community.is_nsfw).toBe(true);
    });

    test("mockActiveUser creates valid active user", () => {
      const activeUser = mockActiveUser();
      expect(activeUser.username).toBe("testuser");
      expect(activeUser.data).toBeDefined();
      expect(activeUser.data.name).toBe("testuser");
    });

    test("mockActiveUser accepts overrides", () => {
      const activeUser = mockActiveUser({
        username: "charlie",
        data: mockFullAccount({ name: "charlie", reputation: "10000000000" })
      });
      expect(activeUser.username).toBe("charlie");
      expect(activeUser.data.name).toBe("charlie");
      expect(activeUser.data.reputation).toBe("10000000000");
    });
  });

  describe("Modal DOM helpers", () => {
    afterEach(() => {
      cleanupModalContainers();
    });

    test("setupModalContainers creates modal containers", () => {
      setupModalContainers();
      expect(document.getElementById("modal-dialog-container")).toBeInTheDocument();
      expect(document.getElementById("modal-overlay-container")).toBeInTheDocument();
    });

    test("cleanupModalContainers removes all containers", () => {
      setupModalContainers();
      expect(document.getElementById("modal-dialog-container")).toBeInTheDocument();

      cleanupModalContainers();
      expect(document.getElementById("modal-dialog-container")).not.toBeInTheDocument();
      expect(document.getElementById("modal-overlay-container")).not.toBeInTheDocument();
    });
  });

  describe("Builder patterns", () => {
    test("EntryBuilder creates entry with fluent API", () => {
      const entry = new EntryBuilder()
        .withAuthor("alice")
        .withPermlink("my-post")
        .withTitle("My Post")
        .withBody("Post content")
        .withVotes([{ voter: "bob", rshares: 1000 }])
        .withComments(5)
        .withPayout(10.5)
        .build();

      expect(entry.author).toBe("alice");
      expect(entry.permlink).toBe("my-post");
      expect(entry.title).toBe("My Post");
      expect(entry.body).toBe("Post content");
      expect(entry.children).toBe(5);
      expect(entry.payout).toBe(10.5);
    });

    test("EntryBuilder.withVotes sets top_votes and stats.total_votes", () => {
      const entry = new EntryBuilder()
        .withVotes([
          { voter: "bob", rshares: 1000, percent: 10000 },
          { voter: "carol", rshares: 500 }
        ])
        .build();

      expect(entry).not.toHaveProperty("active_votes");
      expect(entry.top_votes).toEqual([
        { voter: "bob", rshares: 1000, percent: 10000 },
        { voter: "carol", rshares: 500, percent: null }
      ]);
      expect(entry.stats.total_votes).toBe(2);
      expect(entry.stats.gray).toBe(false);
    });

    test("EntryBuilder.withObserverVote sets observer_vote and observer_vote_for", () => {
      const entry = new EntryBuilder()
        .withObserverVote("bob", { rshares: 1000, percent: 5000 })
        .build();

      expect(entry.observer_vote_for).toBe("bob");
      expect(entry.observer_vote).toEqual({ rshares: 1000, percent: 5000 });

      // null = the observer has not voted.
      const unvoted = new EntryBuilder().withObserverVote("bob", null).build();
      expect(unvoted.observer_vote_for).toBe("bob");
      expect(unvoted.observer_vote).toBeNull();
    });

    test("EntryBuilder can create comments", () => {
      const comment = new EntryBuilder()
        .withAuthor("bob")
        .asComment("alice", "parent-post")
        .build();

      expect(comment.author).toBe("bob");
      expect(comment.parent_author).toBe("alice");
      expect(comment.parent_permlink).toBe("parent-post");
      expect(comment.depth).toBe(1);
    });

    test("EntryBuilder can create community posts", () => {
      const entry = new EntryBuilder()
        .withAuthor("charlie")
        .inCommunity("hive-123456", "Test Community")
        .build();

      expect(entry.community).toBe("hive-123456");
      expect(entry.community_title).toBe("Test Community");
    });

    test("AccountBuilder creates account with fluent API", () => {
      const account = new AccountBuilder()
        .withUsername("alice")
        .withReputation("100000000000")
        .withBalance("1000.000 HIVE")
        .withHbdBalance("500.000 HBD")
        .withProfile({ name: "Alice", about: "Test user" })
        .withPostCount(250)
        .build();

      expect(account.name).toBe("alice");
      expect(account.reputation).toBe("100000000000");
      expect(account.balance).toBe("1000.000 HIVE");
      expect(account.hbd_balance).toBe("500.000 HBD");
      expect(account.profile?.name).toBe("Alice");
      expect(account.post_count).toBe(250);
    });
  });
});
