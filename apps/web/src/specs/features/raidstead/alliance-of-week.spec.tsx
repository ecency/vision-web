import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// the game's strings load on their own; here they are there at once
vi.mock("@/features/i18n/raidstead", () => ({ ensureRaidsteadLoaded: vi.fn(async () => undefined) }));

import { AllianceOfWeekBadge } from "@/features/raidstead/alliance-of-week";
import { forgetWeekWinners } from "@/features/raidstead/week";

const kill = (community: string, league: string, hours: number) => ({
  community,
  title: community.toUpperCase(),
  league,
  killSecs: hours * 3600,
  raiders: 5,
  members: 10
});

const answer = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("Alliance of the Week badge", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => forgetWeekWinners());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("shows on last week's winner's community page, linking to /raidstead", async () => {
    globalThis.fetch = answer(200, {
      season: 2,
      week: 1,
      kills: [kill("hive-a", "medium", 30), kill("hive-b", "medium", 20), kill("hive-s", "small", 40)]
    }) as typeof fetch;
    render(<AllianceOfWeekBadge community="hive-b" />);
    const link = await screen.findByRole("link", { name: /raidstead.aotw.badge/ });
    expect(link.getAttribute("href")).toBe("/raidstead");
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toMatch(/\/v1\/raidstead\/week$/);
  });

  it("shows nothing on a community that did not win", async () => {
    const f = answer(200, { season: 2, week: 1, kills: [kill("hive-b", "medium", 20)] });
    globalThis.fetch = f as typeof fetch;
    render(<AllianceOfWeekBadge community="hive-a" />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows nothing, and asks once, when the server has no such route", async () => {
    const f = answer(404, { error: "not_found" });
    globalThis.fetch = f as typeof fetch;
    const view = render(<AllianceOfWeekBadge community="hive-b" />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    view.rerender(<AllianceOfWeekBadge community="hive-b" />);
    render(<AllianceOfWeekBadge community="hive-b" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link")).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
