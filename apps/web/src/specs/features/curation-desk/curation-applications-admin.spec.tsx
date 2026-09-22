import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, iso, jsonResponse, makeStatus } from "./curation-test-utils";

const state = vi.hoisted(() => ({
  username: "boss" as string | undefined,
  role: "admin" as string
}));
const flags = vi.hoisted(() => ({
  applications: true,
  notFound: vi.fn(() => "not-found" as unknown as never)
}));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk"))
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
  getAccessToken: vi.fn(() => "code-1")
}));
vi.mock("@/config", () => {
  // Defined inside the factory: vi.mock is hoisted above any const above it.
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
vi.mock("next/navigation", () => ({
  notFound: () => flags.notFound(),
  usePathname: () => "/curation"
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));
vi.mock("@/features/metadata", () => ({
  PagesMetadataGenerator: { getForPage: vi.fn(async () => ({})) }
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => state.username }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));

import CurationApplyPage from "@/app/curation/apply/page";
import { CurationTabs } from "@/app/curation/_components/curation-tabs";
import {
  CurationApplicationsPanel,
  draftOrStored
} from "@/features/curation-desk/curation-applications-panel";
import { CurationGuide } from "@/features/curation-desk/curation-guide";
import { CurationRosterView } from "@/features/curation-desk/curation-roster-view";

const APPLICATION = {
  id: 3,
  username: "newbie",
  answers: { motivation: "why", availability: "evenings", pick: "a post" },
  snapshot: {
    username: "newbie",
    recommended: 6,
    curated: 4,
    dismissed: 1,
    withdrawn: 0,
    precision: 1.3,
    trusted: true
  },
  state: "open",
  decided_by: null,
  decided_at: null,
  admin_note: null,
  created: iso(-86_400_000),
  updated_at: iso(-86_400_000)
};

/**
 * The review side lives in the admin-only roster tab, because promoting writes
 * the roster row the form below it manages. What matters here: nobody but an
 * admin asks for the list, and a promotion says which seat it grants.
 */
describe("curation applications, admin side", () => {
  let router: ReturnType<typeof installFetchRouter>;

  beforeEach(() => {
    state.username = "boss";
    state.role = "admin";
    flags.applications = true;
    flags.notFound.mockClear();
    router = installFetchRouter();
    router.on(/curation-desk\/roster$/, () =>
      jsonResponse({
        curators: [{ username: "boss", role: state.role, active: true, rules: null }],
        updated_at: iso(0)
      })
    );
    router.on(/curation-desk\/status$/, () => jsonResponse(makeStatus()));
    router.on(/curation-desk\/roster-list$/, () => jsonResponse({ curators: [] }));
    router.on(/curation-desk\/application-list$/, () =>
      jsonResponse({
        applications: [APPLICATION],
        counts: { open: 1 },
        window: { open: true, message: null }
      })
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("never asks for the queue when the viewer is not an admin", async () => {
    state.role = "mod";
    renderWithQueryClient(<CurationRosterView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.roster.admins-only")).toBeInTheDocument()
    );
    expect(router.callsTo(/application-list/)).toHaveLength(0);
  });

  it("promotes with the seat it shows, and only an acceptance carries one", async () => {
    const writes: Record<string, unknown>[] = [];
    router.on(/curation-desk\/application-decide$/, (_url: string, init: RequestInit) => {
      writes.push(JSON.parse(String(init.body)));
      return jsonResponse({ application: { ...APPLICATION, state: "accepted" } });
    });

    renderWithQueryClient(<CurationRosterView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    const row = screen.getByText("@newbie").closest("li")!;

    fireEvent.click(within(row).getByText("curation-desk.applications.promote"));
    await waitFor(() => expect(writes).toHaveLength(1));
    // A trial is not trailed, which is what makes it a trial: the default seat
    // must be the one the desk can undo without having voted anything.
    expect(writes[0]).toMatchObject({ applicant: "newbie", state: "accepted", role: "trial" });

    // and the select is what it promotes with, not a constant
    fireEvent.change(within(row).getByLabelText("curation-desk.applications.seat"), {
      target: { value: "curator" }
    });
    fireEvent.click(within(row).getByText("curation-desk.applications.promote"));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toMatchObject({ applicant: "newbie", state: "accepted", role: "curator" });

    fireEvent.click(within(row).getByText("curation-desk.applications.decline"));
    await waitFor(() => expect(writes).toHaveLength(3));
    expect(writes[2]).toMatchObject({ applicant: "newbie", state: "declined" });
    expect(writes[2].role).toBeUndefined();
  });

  it("opens and closes applications with the line readers see", async () => {
    const writes: Record<string, unknown>[] = [];
    router.on(/curation-desk\/application-window$/, (_url: string, init: RequestInit) => {
      writes.push(JSON.parse(String(init.body)));
      return jsonResponse({ window: { open: false, message: "Back next month." } });
    });

    renderWithQueryClient(<CurationRosterView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.applications.window-open")).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText("curation-desk.applications.message-label"), {
      target: { value: "Back next month." }
    });
    fireEvent.click(screen.getByText("curation-desk.applications.close-action"));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ open: false, message: "Back next month." });
  });

  it("asks for nothing while it is not enabled", async () => {
    // The panel carries its own gate: the view above it already refuses a
    // non-admin, so this proves the prop rather than that refusal.
    renderWithQueryClient(<CurationApplicationsPanel enabled={false} />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.applications.title")).toBeInTheDocument()
    );
    expect(router.callsTo(/application-list/)).toHaveLength(0);
  });

  it("will not flip a window it has not read yet", async () => {
    // Undefined is not "open": a click here sent `open: true` at a desk that was
    // closed, and the reader saw applications open for the round trip.
    router.on(/curation-desk\/application-list$/, () => jsonResponse({ error: "nope" }, 500));
    renderWithQueryClient(<CurationRosterView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.applications.error")).toBeInTheDocument()
    );
    expect(
      screen.getByText("curation-desk.applications.open-action").closest("button")
    ).toBeDisabled();
  });

  it("saves the closed line without opening applications to do it", async () => {
    const writes: Record<string, unknown>[] = [];
    router.on(/curation-desk\/application-list$/, () =>
      jsonResponse({
        applications: [],
        counts: {},
        window: { open: false, message: "Closed." }
      })
    );
    router.on(/curation-desk\/application-window$/, (_url: string, init: RequestInit) => {
      writes.push(JSON.parse(String(init.body)));
      return jsonResponse({ window: { open: false, message: "Closed until October." } });
    });

    renderWithQueryClient(<CurationRosterView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.applications.window-closed")).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText("curation-desk.applications.message-label"), {
      target: { value: "Closed until October." }
    });
    fireEvent.click(screen.getByText("curation-desk.applications.message-save"));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ open: false, message: "Closed until October." });
  });

  it("reads the queue again when a decision is refused", async () => {
    // 404 means another admin decided this applicant first, so the row on screen
    // is already wrong: a failure is exactly when the list has to be re-read.
    router.on(/curation-desk\/application-decide$/, () =>
      jsonResponse({ error: "not found" }, 404)
    );
    renderWithQueryClient(<CurationRosterView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    const before = router.callsTo(/application-list/).length;

    fireEvent.click(screen.getByText("curation-desk.applications.decline"));
    await waitFor(() => expect(router.callsTo(/application-list/).length).toBeGreaterThan(before));
  });

  it("shortlists without granting a seat", async () => {
    const writes: Record<string, unknown>[] = [];
    router.on(/curation-desk\/application-decide$/, (_url: string, init: RequestInit) => {
      writes.push(JSON.parse(String(init.body)));
      return jsonResponse({ application: { ...APPLICATION, state: "shortlisted" } });
    });

    renderWithQueryClient(<CurationRosterView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    const row = screen.getByText("@newbie").closest("li")!;
    fireEvent.click(within(row).getByText("curation-desk.applications.shortlist"));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ applicant: "newbie", state: "shortlisted" });
    expect(writes[0].role).toBeUndefined();
  });

  it("hides the shortlist button on a row that is already shortlisted", async () => {
    router.on(/curation-desk\/application-list$/, () =>
      jsonResponse({
        applications: [{ ...APPLICATION, state: "shortlisted" }],
        counts: { shortlisted: 1 },
        window: { open: true, message: null }
      })
    );
    renderWithQueryClient(<CurationRosterView />);
    await waitFor(() => expect(screen.getByText("@newbie")).toBeInTheDocument());
    const row = screen.getByText("@newbie").closest("li")!;
    expect(within(row).getByText("curation-desk.applications.shortlisted")).toBeInTheDocument();
    expect(within(row).queryByText("curation-desk.applications.shortlist")).toBeNull();
  });

  it("steps aside when another admin changes the closed line", () => {
    // Holding the text alone made this tab's copy win for ever: another admin's
    // change arrived on a refetch, was ignored, and was overwritten by the next
    // save from here.
    expect(draftOrStored(null, "Theirs.")).toBe("Theirs.");
    expect(draftOrStored({ value: "Mine.", basedOn: "Theirs." }, "Theirs.")).toBe("Mine.");
    expect(draftOrStored({ value: "Mine.", basedOn: "Old." }, "Theirs.")).toBe("Theirs.");
  });

  it("shows the stored closed line in the field", async () => {
    router.on(/curation-desk\/application-list$/, () =>
      jsonResponse({
        applications: [],
        counts: {},
        window: { open: false, message: "Closed until October." }
      })
    );
    renderWithQueryClient(<CurationRosterView />);
    const field = await screen.findByLabelText("curation-desk.applications.message-label");
    await waitFor(() => expect(field).toHaveValue("Closed until October."));
  });

  it("does not link the guide at a page the flag has turned off", async () => {
    flags.applications = false;
    const off = renderWithQueryClient(<CurationGuide />);
    expect(screen.queryByText("curation-desk.guide.becoming.apply-link")).toBeNull();
    off.unmount();

    flags.applications = true;
    renderWithQueryClient(<CurationGuide />);
    expect(screen.getByText("curation-desk.guide.becoming.apply-link")).toBeInTheDocument();
  });

  it("goes away entirely with the flag, route, tab and panel together", async () => {
    flags.applications = false;
    CurationApplyPage();
    expect(flags.notFound).toHaveBeenCalled();

    const tabs = renderWithQueryClient(<CurationTabs />);
    expect(screen.queryByText("curation-desk.tabs.apply")).toBeNull();
    tabs.unmount();

    const roster = renderWithQueryClient(<CurationRosterView />);
    await waitFor(() => expect(screen.getByText("curation-desk.roster.intro")).toBeInTheDocument());
    expect(screen.queryByText("curation-desk.applications.title")).toBeNull();
    expect(router.callsTo(/application-list/)).toHaveLength(0);
    roster.unmount();

    flags.notFound.mockClear();
    flags.applications = true;
    CurationApplyPage();
    expect(flags.notFound).not.toHaveBeenCalled();
  });

  it("keeps the apply tab away from the roster and offers it to everyone else", async () => {
    const asAdmin = renderWithQueryClient(<CurationTabs />);
    await waitFor(() => expect(screen.getByText("curation-desk.tabs.roster")).toBeInTheDocument());
    expect(screen.queryByText("curation-desk.tabs.apply")).toBeNull();
    asAdmin.unmount();

    // A trial is the case the roster check exists for: already in, nothing to
    // apply for, and no admin tab to hide behind.
    state.role = "trial";
    const asTrial = renderWithQueryClient(<CurationTabs />);
    await waitFor(() => expect(screen.getByText("curation-desk.tabs.queue")).toBeInTheDocument());
    expect(screen.queryByText("curation-desk.tabs.apply")).toBeNull();
    asTrial.unmount();

    state.username = "newbie";
    state.role = "admin";
    renderWithQueryClient(<CurationTabs />);
    await waitFor(() => expect(screen.getByText("curation-desk.tabs.apply")).toBeInTheDocument());
  });
});
