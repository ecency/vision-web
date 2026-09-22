import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, iso, jsonResponse, makeStatus } from "./curation-test-utils";

const state = vi.hoisted(() => ({
  username: "mod1" as string | undefined,
  role: "mod" as string | null
}));
const flags = vi.hoisted(() => ({ applications: true }));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk"))
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
  getAccessToken: vi.fn(() => "code-1")
}));
vi.mock("@/config", () => {
  const read = (condition: (config: unknown) => unknown) =>
    condition({
      visionFeatures: {
        curationDesk: {
          enabled: true,
          recommendations: { enabled: true },
          applications: { enabled: flags.applications }
        }
      }
    });
  return { EcencyConfigManager: { useConfig: read, getConfigValue: read } };
});
vi.mock("next/navigation", () => ({ notFound: vi.fn(), usePathname: () => "/curation" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => state.username }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));

import { CurationTabs } from "@/app/curation/_components/curation-tabs";
import { CurationApplicationsView } from "@/features/curation-desk/curation-applications-view";
import { CurationRosterView } from "@/features/curation-desk/curation-roster-view";

const BASE = {
  id: 3,
  username: "newbie",
  answers: { motivation: "why", availability: "evenings", pick: "a post" },
  snapshot: null,
  state: "open",
  decided_by: null,
  decided_at: null,
  admin_note: null,
  created: iso(-86_400_000),
  updated_at: iso(-86_400_000),
  votes: [],
  tally: { endorsed: 0, objected: 0 },
  my_vote: null
};

const vote = (voter: string, value: string, standing = true) => ({
  voter,
  vote: value,
  note: null,
  created: iso(-3600_000),
  updated_at: iso(-3600_000),
  standing
});

/**
 * Electing a guest curator. The bench votes, a quorum grants the seat, and the
 * numbers behind that stay with the admins.
 */
describe("curation elections", () => {
  let router: ReturnType<typeof installFetchRouter>;

  function queue(application: Record<string, unknown> = {}, quorum = 3) {
    router.on(/curation-desk\/application-list$/, () =>
      jsonResponse({
        applications: [{ ...BASE, ...application }],
        counts: { open: 1 },
        window: { open: true, message: null },
        quorum,
        term_days: 30
      })
    );
  }

  beforeEach(() => {
    state.username = "mod1";
    state.role = "mod";
    flags.applications = true;
    router = installFetchRouter();
    router.on(/curation-desk\/roster$/, () =>
      jsonResponse({
        curators: state.role
          ? [{ username: state.username, role: state.role, active: true, rules: null }]
          : [],
        updated_at: iso(0)
      })
    );
    router.on(/curation-desk\/status$/, () => jsonResponse(makeStatus()));
    router.on(/curation-desk\/roster-list$/, () => jsonResponse({ curators: [] }));
    queue();
  });

  afterEach(() => vi.unstubAllGlobals());

  // --- casting a vote ----------------------------------------------------

  it("sends the applicant and the value, and never a username", async () => {
    const writes: Record<string, unknown>[] = [];
    router.on(/curation-desk\/application-vote$/, (_url: string, init: RequestInit) => {
      writes.push(JSON.parse(String(init.body)));
      return jsonResponse({
        application: BASE,
        votes: [vote("mod1", "endorse")],
        tally: { endorsed: 1, objected: 0 },
        quorum: 3,
        elected: false
      });
    });

    renderWithQueryClient(<CurationApplicationsView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    const row = screen.getByText("@newbie").closest("li")!;

    fireEvent.click(within(row).getByText("curation-desk.applications.vote-endorse"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ applicant: "newbie", vote: "endorse" });
    // The gateway fills the caller in from the signed code; a username here would be
    // a client claiming an identity.
    expect("username" in writes[0]).toBe(false);
    expect(writes[0].code).toBe("code-1");
  });

  it("reads the roster again after a vote, because a vote can grant a seat", async () => {
    router.on(/curation-desk\/application-vote$/, () =>
      jsonResponse({
        application: { ...BASE, state: "accepted" },
        votes: [],
        tally: { endorsed: 3, objected: 0 },
        quorum: 3,
        elected: true
      })
    );
    renderWithQueryClient(<CurationApplicationsView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    const before = router.callsTo(/curation-desk\/roster$/).length;
    fireEvent.click(screen.getByText("curation-desk.applications.vote-endorse"));
    // The third endorsement writes the curator row in the same transaction, so a
    // roster read from before it is stale the moment this resolves.
    await waitFor(() =>
      expect(router.callsTo(/curation-desk\/roster$/).length).toBeGreaterThan(before)
    );
  });

  it("offers withdrawing only to somebody who has actually voted", async () => {
    queue({ my_vote: null });
    const { unmount } = renderWithQueryClient(<CurationApplicationsView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    expect(
      screen.getByText("curation-desk.applications.vote-abstain").closest("button")
    ).toBeDisabled();
    unmount();

    queue({ my_vote: "object", tally: { endorsed: 0, objected: 1 }, votes: [vote("mod1", "object")] });
    renderWithQueryClient(<CurationApplicationsView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    expect(
      screen.getByText("curation-desk.applications.vote-abstain").closest("button")
    ).not.toBeDisabled();
  });

  // --- what the tally says ------------------------------------------------

  it("shows a vote from somebody off the bench struck through, not dropped", async () => {
    queue({
      votes: [vote("mod1", "endorse"), vote("gone", "endorse", false)],
      tally: { endorsed: 1, objected: 0 }
    });
    renderWithQueryClient(<CurationApplicationsView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    // The desk does the counting. What this proves is that the line is still on the
    // screen and marked, so a total one short has a visible reason rather than
    // reading as a bug.
    const stale = screen.getByText("+@gone");
    expect(stale.className).toContain("line-through");
    expect(screen.getByText("+@mod1").className).not.toContain("line-through");
  });

  it("does not raise an objection nobody stands behind any more", async () => {
    // The one piece of counting this client does for itself: whether to show the
    // objections chip at all. A retired objector must not make it appear.
    queue({
      votes: [vote("gone", "object", false)],
      tally: { endorsed: 0, objected: 0 }
    });
    renderWithQueryClient(<CurationApplicationsView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    expect(screen.queryByText("curation-desk.applications.objections")).toBeNull();
    expect(screen.getByText("-@gone").className).toContain("line-through");
  });

  it("shows an objection apart from the endorsements", async () => {
    queue({
      votes: [vote("mod1", "endorse"), vote("mod2", "object")],
      tally: { endorsed: 1, objected: 1 }
    });
    renderWithQueryClient(<CurationApplicationsView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    expect(screen.getByText("curation-desk.applications.objections")).toBeInTheDocument();
    expect(screen.getByText("-@mod2")).toBeInTheDocument();
  });

  it("keeps an abstention out of the names entirely", async () => {
    queue({ votes: [vote("mod1", "abstain")], tally: { endorsed: 0, objected: 0 } });
    renderWithQueryClient(<CurationApplicationsView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    expect(screen.queryByText("+@mod1")).toBeNull();
    expect(screen.queryByText("-@mod1")).toBeNull();
  });

  // --- the numbers behind the election ------------------------------------

  it("sends the knobs only from the button that is about them", async () => {
    state.role = "admin";
    const writes: Record<string, unknown>[] = [];
    router.on(/curation-desk\/application-window$/, (_url: string, init: RequestInit) => {
      writes.push(JSON.parse(String(init.body)));
      return jsonResponse({ window: { open: true, message: null }, quorum: 5, term_days: 30 });
    });

    renderWithQueryClient(<CurationApplicationsView />);
    const quorum = await screen.findByLabelText("curation-desk.applications.quorum-label");
    await waitFor(() => expect(quorum).toHaveValue(3));

    // The ordinary message save must not carry them: upstream reads an absent knob as
    // "leave it alone", so sending the shown value back would re-set a number another
    // admin had changed in between.
    fireEvent.click(screen.getByText("curation-desk.applications.message-save"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect("quorum" in writes[0]).toBe(false);
    expect("term_days" in writes[0]).toBe(false);

    fireEvent.change(quorum, { target: { value: "5" } });
    fireEvent.click(screen.getByText("curation-desk.applications.knobs-save"));
    await waitFor(() => expect(writes).toHaveLength(2));
    // Only what changed. The term is untouched, so it must not travel at all: absent
    // means "leave it alone", and sending it back would re-set a number another admin
    // had moved, while looking like a no-op.
    expect(writes[1]).toMatchObject({ quorum: 5 });
    expect("term_days" in writes[1]).toBe(false);
  });

  it("lets another admin's change win over a number being edited here", async () => {
    state.role = "admin";
    const writes: Record<string, unknown>[] = [];
    let served = 3;
    router.on(/curation-desk\/application-list$/, () =>
      jsonResponse({
        applications: [BASE],
        counts: { open: 1 },
        window: { open: true, message: null },
        quorum: served,
        term_days: 30
      })
    );
    router.on(/curation-desk\/application-window$/, (_url: string, init: RequestInit) => {
      writes.push(JSON.parse(String(init.body)));
      return jsonResponse({ window: { open: true, message: null }, quorum: served, term_days: 30 });
    });
    router.on(/curation-desk\/application-vote$/, () =>
      jsonResponse({
        application: BASE,
        votes: [],
        tally: { endorsed: 1, objected: 0 },
        quorum: served,
        elected: false
      })
    );

    renderWithQueryClient(<CurationApplicationsView />);
    const quorum = await screen.findByLabelText("curation-desk.applications.quorum-label");
    await waitFor(() => expect(quorum).toHaveValue(3));

    // Typed here, and meanwhile somebody else sets it to 5. The refetch is triggered by
    // something this tab did that is NOT a window save, so nothing here clears the
    // draft: only the draft's basis moving can make the new number win.
    fireEvent.change(quorum, { target: { value: "4" } });
    expect(quorum).toHaveValue(4);
    served = 5;
    fireEvent.click(screen.getAllByText("curation-desk.applications.vote-endorse")[0]);

    // Held on its own the draft would hide the change and then send 4 back over the 5.
    await waitFor(() => expect(quorum).toHaveValue(5));

    fireEvent.change(quorum, { target: { value: "6" } });
    fireEvent.click(screen.getByText("curation-desk.applications.knobs-save"));
    await waitFor(() => expect(writes).toHaveLength(1));
    // Only the knob that moved: the term was never touched, and absent means
    // "leave it alone" upstream.
    expect(writes[0]).toMatchObject({ quorum: 6 });
    expect("term_days" in writes[0]).toBe(false);
  });

  it("will not save a number the desk would refuse", async () => {
    state.role = "admin";
    renderWithQueryClient(<CurationApplicationsView />);
    const quorum = await screen.findByLabelText("curation-desk.applications.quorum-label");
    const save = () => screen.getByText("curation-desk.applications.knobs-save").closest("button");

    // Nothing changed yet.
    await waitFor(() => expect(save()).toBeDisabled());
    // `Number("")` is 0, so an empty field would otherwise read as a quorum of zero.
    fireEvent.change(quorum, { target: { value: "" } });
    expect(save()).toBeDisabled();
    fireEvent.change(quorum, { target: { value: "0" } });
    expect(save()).toBeDisabled();
    fireEvent.change(quorum, { target: { value: "51" } });
    expect(save()).toBeDisabled();
    fireEvent.change(quorum, { target: { value: "4" } });
    expect(save()).not.toBeDisabled();
  });

  // --- who sees the tab ---------------------------------------------------

  it.each([
    ["admin", true],
    ["mod", true],
    ["curator", false],
    ["trial", false],
    [null, false]
  ])("shows the review tab to %s: %s", async (role, visible) => {
    state.role = role as string | null;
    renderWithQueryClient(<CurationTabs />);
    if (visible) {
      await waitFor(() =>
        expect(screen.getByText("curation-desk.tabs.applications")).toBeInTheDocument()
      );
    } else {
      // Wait for the role to actually be known before concluding it is hidden, or the
      // assertion would pass on the loading frame whatever the role turns out to be.
      await waitFor(() => expect(router.callsTo(/curation-desk\/roster$/).length).toBeGreaterThan(0));
      await waitFor(() => expect(screen.getByText("curation-desk.tabs.queue")).toBeInTheDocument());
      expect(screen.queryByText("curation-desk.tabs.applications")).toBeNull();
    }
  });

  it("keeps the review tab away when the flag is off", async () => {
    state.role = "mod";
    flags.applications = false;
    renderWithQueryClient(<CurationTabs />);
    await waitFor(() => expect(screen.getByText("curation-desk.tabs.queue")).toBeInTheDocument());
    expect(screen.queryByText("curation-desk.tabs.applications")).toBeNull();
  });

  // --- the term on the roster --------------------------------------------

  it("shows a guest term and keeps the seat with an explicit zero", async () => {
    state.username = "boss";
    state.role = "admin";
    const writes: Record<string, unknown>[] = [];
    router.on(/curation-desk\/roster-list$/, () =>
      jsonResponse({
        curators: [
          {
            username: "guest1",
            role: "curator",
            active: true,
            rules: {},
            trail: true,
            added_by: "boss",
            added_at: iso(-86_400_000),
            removed_at: null,
            note: "guest curator 2026-09",
            term_ends: iso(20 * 86_400_000)
          },
          {
            username: "boss",
            role: "admin",
            active: true,
            rules: {},
            trail: false,
            added_by: "seed",
            added_at: iso(-86_400_000),
            removed_at: null,
            note: null,
            term_ends: null
          }
        ]
      })
    );
    router.on(/curation-desk\/roster-set$/, (_url: string, init: RequestInit) => {
      writes.push(JSON.parse(String(init.body)));
      return jsonResponse({ curator: { username: "guest1", role: "curator", active: true } });
    });

    renderWithQueryClient(<CurationRosterView />);
    await waitFor(() => expect(screen.getByText("@guest1")).toBeInTheDocument());
    const guest = screen.getByText("@guest1").closest("li")!;
    expect(within(guest).getByText("curation-desk.roster.term-ends")).toBeInTheDocument();

    // A permanent seat shows nothing at all here, and has nothing to keep.
    const boss = screen.getByText("@boss").closest("li")!;
    expect(within(boss).queryByText("curation-desk.roster.keep")).toBeNull();

    fireEvent.click(within(guest).getByText("curation-desk.roster.keep"));
    await waitFor(() => expect(writes).toHaveLength(1));
    // 0, not absent: absent KEEPS the term, which is what makes every other edit on
    // this page safe. Only an explicit zero stops the clock.
    expect(writes[0]).toMatchObject({ curator: "guest1", role: "curator", term_days: 0 });
  });
});
