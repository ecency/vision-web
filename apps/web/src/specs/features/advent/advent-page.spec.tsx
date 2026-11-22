import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithQueryClient, setupModalContainers, cleanupModalContainers } from "@/specs/test-utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import type { PublicDoor, SeasonState } from "@/features/advent/types";

const api = vi.hoisted(() => ({
  season: vi.fn(),
  open: vi.fn(),
  answer: vi.fn(),
  wave: vi.fn(),
  result: vi.fn(),
  grand: vi.fn()
}));
// next/font only runs inside the Next build
vi.mock("@/features/advent/font", () => ({ adventFont: {} }));
vi.mock("@/features/advent/client", () => ({ adventApi: api }));
const session = vi.hoisted(() => ({ status: "ready", signNow: vi.fn(), lost: vi.fn() }));
const owner = vi.hoisted(() => ({ account: "maria" as string | null }));
vi.mock("@/features/advent/use-advent-session", () => ({
  useAdventSession: () => session,
  sessionIsFor: (a: string | null | undefined) => !!a && a === owner.account
}));
const postWave = vi.hoisted(() => vi.fn());
vi.mock("@/features/advent/use-advent-wave", () => ({ useAdventWave: () => postWave }));

import { AdventCalendar } from "@/app/advent/_components/advent-calendar";

const DAY = 86_400_000;
const START = Date.UTC(2026, 11, 1);
function doors(today: number): PublicDoor[] {
  return Array.from({ length: 24 }, (_, i) => {
    const day = i + 1;
    const unlock = START + i * DAY;
    const status: PublicDoor["status"] = day < today - 1 ? "drawn" : day < today ? "closed" : day === today ? "open" : "locked";
    const kind: PublicDoor["kind"] = day % 2 ? "open" : "poll";
    return {
      day,
      unlockAt: new Date(unlock).toISOString(),
      closeAt: new Date(unlock + DAY - 1).toISOString(),
      kind,
      reward: { kind: "points", amounts: [2500, 1500, 1000] },
      status,
      ...(status === "locked"
        ? {}
        : { prompt: `Prompt for door ${day}`, choices: kind === "poll" ? ["Waves", "Decks", "Scheduled posts"] : [], artwork: null })
    };
  });
}

function signedIn(name: string | null) {
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: name ? ({ username: name } as never) : null,
    username: name,
    account: null,
    isLoading: false
  } as never);
}

const look = (c: HTMLElement, l: string) => c.querySelectorAll(`[data-look="${l}"]`);

// numbers as an en-US reader sees them, whatever the machine running the specs uses
let numbers: { mockRestore(): void } | undefined;
beforeEach(() => {
  const plain = Number.prototype.toLocaleString;
  numbers = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (this: number, locales?: Intl.LocalesArgument, o?: Intl.NumberFormatOptions) {
    return plain.call(this, locales ?? "en-US", o);
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  setupModalContainers();
  Object.values(api).forEach((f) => f.mockReset());
  api.grand.mockRejectedValue(new Error("no_grand"));
  postWave.mockReset();
  session.status = "ready";
  owner.account = "maria";
});
afterEach(() => {
  numbers?.mockRestore();
  vi.useRealTimers();
  cleanupModalContainers();
  signedIn(null);
});

describe("Advent Calendar page", () => {
  it("shows the teaser before the first door, all presents still wrapped", async () => {
    vi.setSystemTime(Date.UTC(2026, 10, 29, 12));
    signedIn(null);
    api.season.mockResolvedValue({ season: 2026, doors: [] } satisfies SeasonState);
    const { container } = renderWithQueryClient(<AdventCalendar />);
    expect(screen.getByText("advent.teaser-title")).toBeInTheDocument();
    expect(look(container, "locked")).toHaveLength(24);
    expect(screen.getByRole("button", { name: /advent.snow/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /advent.remind/ })).not.toBeInTheDocument();
  });

  it("shows where a signed-in reader stands on 6 December", async () => {
    vi.setSystemTime(Date.UTC(2026, 11, 6, 9));
    signedIn("maria");
    api.season.mockResolvedValue({
      season: 2026,
      doors: doors(6),
      pool: { left: 21350 },
      me: {
        account: "maria",
        answered: 3,
        reminders: true,
        doors: {
          "1": { opened: true, answered: true, late: false, participation: { amount: 25, status: "paid" } },
          "2": { opened: true, answered: true, late: false, prize: { place: 2, kind: "points", amount: 1500, status: "paid" } },
          "5": { opened: true, answered: true, late: false }
        }
      }
    } satisfies SeasonState);
    const { container } = renderWithQueryClient(<AdventCalendar />);
    await waitFor(() => expect(look(container, "today")).toHaveLength(1));
    expect(look(container, "won")).toHaveLength(1);
    expect(look(container, "answered")).toHaveLength(1);
    expect(look(container, "waiting")).toHaveLength(1);
    expect(look(container, "missed")).toHaveLength(2);
    expect(look(container, "locked")).toHaveLength(18);
    expect(screen.getByText("21,350")).toBeInTheDocument();
  });

  it("shows the grand draw and how far the reader is toward it", async () => {
    vi.setSystemTime(Date.UTC(2026, 11, 6, 9));
    signedIn("maria");
    api.season.mockResolvedValue({ season: 2026, doors: doors(6), me: { account: "maria", answered: 3, reminders: false, doors: {} } });
    api.grand.mockResolvedValue({ season: 2026, status: "scheduled", drawAt: "2026-12-25T12:00:00.000Z", minDoors: 20, amounts: [5000, 3000, 2000] });
    renderWithQueryClient(<AdventCalendar />);
    await screen.findByText("advent.grand-title");
    expect(screen.getByText("advent.grand-text")).toBeInTheDocument();
    expect(screen.getByText("advent.grand-progress")).toBeInTheDocument();
  });

  it("asks a signed-out reader to log in to open today's door", async () => {
    vi.setSystemTime(Date.UTC(2026, 11, 6, 9));
    signedIn(null);
    session.status = "none";
    api.season.mockResolvedValue({ season: 2026, doors: doors(6) } satisfies SeasonState);
    const { container } = renderWithQueryClient(<AdventCalendar />);
    await waitFor(() => expect(look(container, "today")).toHaveLength(1));
    expect(look(container, "results")).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "advent.login-to-open" }).length).toBeGreaterThan(0);
  });

  async function openToday(day: number) {
    vi.setSystemTime(Date.UTC(2026, 11, day, 9));
    signedIn("maria");
    api.season.mockResolvedValue({ season: 2026, doors: doors(day), me: { account: "maria", answered: 0, reminders: false, doors: {} } });
    const d = doors(day)[day - 1];
    api.open.mockResolvedValue({ ...d, entry: { answered: false, answer: null, choice: null, late: false, wave: null } });
    const r = renderWithQueryClient(<AdventCalendar />);
    await waitFor(() => expect(look(r.container, "today")).toHaveLength(1));
    fireEvent.click(look(r.container, "today")[0]);
    await screen.findByText(`Prompt for door ${day}`);
    return r;
  }

  it("submits a written answer, then posts it as a Wave", async () => {
    await openToday(7);
    api.answer.mockResolvedValue({ ok: true, late: false });
    api.wave.mockResolvedValue({ ok: true });
    postWave.mockResolvedValue("wave-xyz");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Curation trails taught me a lot." } });
    fireEvent.click(screen.getByRole("button", { name: "advent.submit-wave" }));
    await screen.findByText("advent.answered-title");
    expect(api.answer).toHaveBeenCalledWith(2026, 7, { answer: "Curation trails taught me a lot." });
    expect(postWave.mock.calls[0][0]).toContain("Curation trails taught me a lot.");
    expect(postWave.mock.calls[0][0]).toContain("#ecencyadvent");
    expect(api.wave).toHaveBeenCalledWith(2026, 7, "wave-xyz");
    expect(api.answer.mock.invocationCallOrder[0]).toBeLessThan(postWave.mock.invocationCallOrder[0]);
  });

  it("keeps the answer when the Wave fails, and offers to post it again", async () => {
    await openToday(7);
    api.answer.mockResolvedValue({ ok: true, late: false });
    postWave.mockRejectedValueOnce(new Error("cancelled"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Curation trails taught me a lot." } });
    fireEvent.click(screen.getByRole("button", { name: "advent.submit-wave" }));
    await screen.findByText("advent.answered-title");
    expect(api.answer).toHaveBeenCalledTimes(1);
    expect(api.wave).not.toHaveBeenCalled();
    postWave.mockResolvedValue("wave-again");
    api.wave.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "advent.post-wave" }));
    await waitFor(() => expect(api.wave).toHaveBeenCalledWith(2026, 7, "wave-again"));
    expect(api.answer).toHaveBeenCalledTimes(1);
  });

  it("sends a pick and shares a Wave without the choice", async () => {
    await openToday(8);
    api.answer.mockResolvedValue({ ok: true, late: false });
    api.wave.mockResolvedValue({ ok: true });
    postWave.mockResolvedValue("wave-p");
    fireEvent.click(screen.getByRole("radio", { name: "Decks" }));
    fireEvent.click(screen.getByRole("button", { name: "advent.submit" }));
    await screen.findByText("advent.answered-title");
    expect(api.answer).toHaveBeenCalledWith(2026, 8, { choice: 1 });
    expect(postWave.mock.calls[0][0]).not.toContain("Decks");
  });

  it("keeps a failed Wave reachable on a door that has been drawn", async () => {
    vi.setSystemTime(Date.UTC(2026, 11, 6, 9));
    signedIn("maria");
    api.season.mockResolvedValue({
      season: 2026,
      doors: doors(6),
      me: { account: "maria", answered: 1, reminders: false, doors: { "2": { opened: true, answered: true, late: false } } }
    });
    api.result.mockResolvedValue({ day: 2, seedBlock: 1, seedId: "ab", rule: "r", eligible: [], skipped: [], winners: [], entries: 3 });
    const d2 = doors(6)[1];
    api.open.mockResolvedValue({ ...d2, entry: { answered: true, answer: "hello there", choice: null, late: false, wave: null } });
    const { container } = renderWithQueryClient(<AdventCalendar />);
    await waitFor(() => expect(look(container, "answered")).toHaveLength(1));
    fireEvent.click(look(container, "answered")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "advent.your-answer-open" }));
    expect(await screen.findByRole("button", { name: "advent.post-wave" })).toBeInTheDocument();
  });

  it("offers to try again when the calendar does not load", async () => {
    vi.setSystemTime(Date.UTC(2026, 11, 6, 9));
    signedIn(null);
    session.status = "none";
    api.season.mockRejectedValue(new Error("offline"));
    renderWithQueryClient(<AdventCalendar />);
    expect(await screen.findByText("advent.calendar-failed", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("keeps a published Wave that could not be linked, and links that one when the door is opened again", async () => {
    localStorage.clear();
    const { container } = await openToday(7);
    api.answer.mockResolvedValue({ ok: true, late: false });
    api.wave.mockRejectedValue(new Error("offline"));
    postWave.mockResolvedValue("wave-once");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Curation trails taught me a lot." } });
    fireEvent.click(screen.getByRole("button", { name: "advent.submit-wave" }));
    await screen.findByText("advent.answered-title", {}, { timeout: 8000 });
    expect(postWave).toHaveBeenCalledTimes(1);
    // close and open the door again: the server has no Wave for it yet
    fireEvent.click(screen.getByRole("button", { name: "advent.back" }));
    await waitFor(() => expect(screen.queryByText("advent.answered-title")).not.toBeInTheDocument());
    api.open.mockResolvedValue({ ...doors(7)[6], entry: { answered: true, answer: "Curation trails taught me a lot.", choice: null, late: false, wave: null } });
    api.wave.mockReset();
    api.wave.mockResolvedValue({ ok: true });
    fireEvent.click(look(container, "today")[0] ?? container.querySelector('[data-look="waiting"]')!);
    fireEvent.click(await screen.findByRole("button", { name: "advent.link-wave" }, { timeout: 3000 }));
    await waitFor(() => expect(api.wave).toHaveBeenCalledWith(2026, 7, "wave-once"));
    expect(postWave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "advent.post-wave" })).not.toBeInTheDocument();
  }, 20_000);

  it("never links a Wave once the shared session belongs to another account", async () => {
    localStorage.clear();
    await openToday(7);
    api.answer.mockResolvedValue({ ok: true, late: false });
    api.wave.mockResolvedValue({ ok: true });
    // another tab signs in as bob while maria's Wave is being posted
    postWave.mockImplementation(async () => {
      owner.account = "bob";
      return "wave-maria";
    });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Curation trails taught me a lot." } });
    fireEvent.click(screen.getByRole("button", { name: "advent.submit-wave" }));
    await screen.findByText("advent.answered-title");
    expect(api.wave).not.toHaveBeenCalled();
    // kept for maria, to link once her session is back
    expect(localStorage.getItem("ecency_advent_wave_pending_2026_maria_7")).toContain("wave-maria");
  });
});
