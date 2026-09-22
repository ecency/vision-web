import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, iso, jsonResponse, makeStatus } from "./curation-test-utils";

const state = vi.hoisted(() => ({ username: "newbie" as string | undefined }));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk"))
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
  getAccessToken: vi.fn(() => "code-1")
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => state.username }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({
    activeUser: state.username ? { username: state.username } : null,
    account: null,
    isLoading: false
  })
}));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));

import { CurationApplyView } from "@/features/curation-desk/curation-apply-view";

const DAY = 86_400_000;

function sentApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    username: "newbie",
    answers: ANSWERS,
    state: "open",
    created: iso(-DAY),
    updated_at: iso(-DAY),
    decided_at: null,
    ...overrides
  };
}

const ANSWERS = {
  motivation: "I read every day and want to choose on purpose.",
  availability: "About five hours a week, evenings UTC+2.",
  pick: "https://ecency.com/@someone/a-post, their own photographs of the build."
};

function fillForm(answers: Partial<typeof ANSWERS> = {}) {
  const filled = { ...ANSWERS, ...answers };
  for (const key of ["motivation", "availability", "pick"] as const) {
    fireEvent.change(screen.getByLabelText(`curation-desk.apply.${key}-label`), {
      target: { value: filled[key] }
    });
  }
  fireEvent.click(screen.getByLabelText("curation-desk.apply.guide-read"));
}

/**
 * The apply page is the one desk surface aimed at someone who is not a curator,
 * so what matters is that it never invites an action the desk would refuse: no
 * form while applications are closed, nothing sent without an account, and the
 * three answers going out on their own.
 */
describe("CurationApplyView", () => {
  let router: ReturnType<typeof installFetchRouter>;

  beforeEach(() => {
    state.username = "newbie";
    router = installFetchRouter();
    router.on(/curation-desk\/roster$/, () =>
      jsonResponse({
        curators: [{ username: "boss", role: "admin", active: true, rules: null }],
        updated_at: iso(0)
      })
    );
    router.on(/curation-desk\/status$/, () => jsonResponse(makeStatus()));
    router.on(/curation-desk\/application-mine$/, () =>
      jsonResponse({ application: null, window: { open: true, message: null }, role: null })
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends the three answers and nothing else", async () => {
    const writes: Record<string, unknown>[] = [];
    router.on(/curation-desk\/application-apply$/, (_url: string, init: RequestInit) => {
      writes.push(JSON.parse(String(init.body)));
      return jsonResponse({
        application: {
          id: 1,
          username: "newbie",
          answers: ANSWERS,
          state: "open",
          created: iso(0),
          updated_at: iso(0),
          decided_at: null
        },
        window: { open: true, message: null }
      });
    });

    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.questions-title")).toBeInTheDocument()
    );
    fillForm();
    fireEvent.click(screen.getByText("curation-desk.apply.submit"));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(Object.keys(writes[0]).sort()).toEqual(["availability", "code", "motivation", "pick"]);
    expect(writes[0]).toMatchObject({ ...ANSWERS, code: "code-1" });
  });

  it("will not submit until every answer and the guide box are there", async () => {
    const writes: unknown[] = [];
    router.on(/curation-desk\/application-apply$/, () => {
      writes.push(1);
      return jsonResponse({});
    });
    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.questions-title")).toBeInTheDocument()
    );

    // Answers without the confirmation, then the confirmation without one answer.
    fillForm();
    fireEvent.click(screen.getByLabelText("curation-desk.apply.guide-read"));
    expect(screen.getByText("curation-desk.apply.submit").closest("button")).toBeDisabled();

    fireEvent.click(screen.getByLabelText("curation-desk.apply.guide-read"));
    fireEvent.change(screen.getByLabelText("curation-desk.apply.pick-label"), {
      target: { value: "  " }
    });
    expect(screen.getByText("curation-desk.apply.submit").closest("button")).toBeDisabled();
    expect(writes).toHaveLength(0);
  });

  it("counts an answer the way the desk counts it", async () => {
    // Both backends measure in code points, so an emoji is one character there
    // and two to JavaScript: `maxLength` cut a 200 emoji answer in half.
    const emoji = "\u{1F600}".repeat(200);
    expect(emoji.length).toBe(400);

    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.questions-title")).toBeInTheDocument()
    );
    const field = screen.getByLabelText("curation-desk.apply.availability-label");
    fireEvent.change(field, { target: { value: emoji } });
    expect(field).toHaveValue(emoji);

    // and one more is where the desk would stop it, not at half the length
    fireEvent.change(field, { target: { value: emoji + "\u{1F600}" } });
    expect(field).toHaveValue(emoji);
  });

  it("waits for the signed read before offering a form", async () => {
    // In that gap the page knows nothing about an application already sent, a
    // wait still running or a closed window, so a form here invites a refusal.
    let answer: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    router.on(/curation-desk\/application-mine$/, async () => {
      await held;
      return jsonResponse({ application: null, window: { open: true, message: null }, role: null });
    });

    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.what-title")).toBeInTheDocument()
    );
    expect(screen.queryByText("curation-desk.apply.questions-title")).toBeNull();

    answer?.();
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.questions-title")).toBeInTheDocument()
    );
  });

  it("shows the closed message instead of a form when applications are closed", async () => {
    router.on(/curation-desk\/application-mine$/, () =>
      jsonResponse({
        application: null,
        window: { open: false, message: "Seats open again on the first." },
        role: null
      })
    );
    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("Seats open again on the first.")).toBeInTheDocument()
    );
    expect(screen.queryByText("curation-desk.apply.questions-title")).toBeNull();
    expect(screen.queryByText("curation-desk.apply.submit")).toBeNull();
  });

  it("offers the explainer to a logged out reader and asks them to log in", async () => {
    state.username = undefined;
    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.what-title")).toBeInTheDocument()
    );
    // The invitation is the point of the page, so it renders; the form asks for
    // an account rather than pretending an anonymous application is possible.
    expect(screen.getByText("curation-desk.apply.needs-login")).toBeInTheDocument();
    expect(router.callsTo(/application-mine/)).toHaveLength(0);
  });

  it("tells a curator there is nothing to apply for", async () => {
    router.on(/curation-desk\/application-mine$/, () =>
      jsonResponse({ application: null, window: { open: true, message: null }, role: "trial" })
    );
    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.roster-member")).toBeInTheDocument()
    );
    expect(screen.queryByText("curation-desk.apply.questions-title")).toBeNull();
  });

  it("offers the form again once a declined applicant has waited", async () => {
    // The desk takes a new application 30 days after a decline, so a page that
    // kept showing the decision and no form would refuse on the desk's behalf.
    router.on(/curation-desk\/application-mine$/, () =>
      jsonResponse({
        application: sentApplication({
          state: "declined",
          decided_at: iso(-31 * DAY),
          updated_at: iso(-31 * DAY)
        }),
        window: { open: true, message: null },
        role: null
      })
    );
    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.state-declined")).toBeInTheDocument()
    );
    expect(screen.getByText("curation-desk.apply.questions-title")).toBeInTheDocument();
  });

  it("keeps the form away while the wait after a decline is still running", async () => {
    router.on(/curation-desk\/application-mine$/, () =>
      jsonResponse({
        application: sentApplication({
          state: "declined",
          decided_at: iso(-2 * DAY),
          updated_at: iso(-2 * DAY)
        }),
        window: { open: true, message: null },
        role: null
      })
    );
    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.state-declined")).toBeInTheDocument()
    );
    expect(screen.getByText("curation-desk.apply.declined-again")).toBeInTheDocument();
    expect(screen.queryByText("curation-desk.apply.questions-title")).toBeNull();
  });

  it("welcomes back an accepted applicant who has left the roster", async () => {
    router.on(/curation-desk\/application-mine$/, () =>
      jsonResponse({
        application: sentApplication({ state: "accepted", decided_at: iso(-30 * DAY) }),
        window: { open: true, message: null },
        role: null
      })
    );
    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.state-accepted")).toBeInTheDocument()
    );
    expect(screen.getByText("curation-desk.apply.questions-title")).toBeInTheDocument();
  });

  it("says nothing it cannot know when the signed read fails", async () => {
    // A failed read says nothing about whether an application exists, and a form
    // offered here sends one the desk answers "you have already applied".
    router.on(/curation-desk\/application-mine$/, () => jsonResponse({ error: "nope" }, 500));
    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("curation-desk.apply.questions-title")).toBeNull();
  });

  it("reads the closed window from the public status for a logged out reader", async () => {
    state.username = undefined;
    router.on(/curation-desk\/status$/, () =>
      jsonResponse({
        ...makeStatus(),
        applications: { open: false, message: "Closed until October." }
      })
    );
    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() => expect(screen.getByText("Closed until October.")).toBeInTheDocument());
    expect(screen.queryByText("curation-desk.apply.questions-title")).toBeNull();
  });

  it("keeps what was typed when the submit fails", async () => {
    router.on(/curation-desk\/application-apply$/, () =>
      jsonResponse({ error: "applications are closed" }, 400)
    );
    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.questions-title")).toBeInTheDocument()
    );
    fillForm();
    fireEvent.click(screen.getByText("curation-desk.apply.submit"));
    await waitFor(() => expect(router.callsTo(/application-apply/)).toHaveLength(1));
    expect(screen.getByLabelText("curation-desk.apply.motivation-label")).toHaveValue(
      ANSWERS.motivation
    );
  });

  it("shows a sent application with a way to take it back", async () => {
    const writes: unknown[] = [];
    router.on(/curation-desk\/application-mine$/, () =>
      jsonResponse({
        application: {
          id: 7,
          username: "newbie",
          answers: ANSWERS,
          state: "open",
          created: iso(-3_600_000),
          updated_at: iso(-3_600_000),
          decided_at: null
        },
        window: { open: true, message: null },
        role: null
      })
    );
    router.on(/curation-desk\/application-withdraw$/, (_url: string, init: RequestInit) => {
      writes.push(JSON.parse(String(init.body)));
      return jsonResponse({ application: { state: "withdrawn" } });
    });

    renderWithQueryClient(<CurationApplyView />);
    await waitFor(() =>
      expect(screen.getByText("curation-desk.apply.state-open")).toBeInTheDocument()
    );
    expect(screen.getByText(ANSWERS.motivation)).toBeInTheDocument();
    expect(screen.queryByText("curation-desk.apply.questions-title")).toBeNull();

    fireEvent.click(screen.getByText("curation-desk.apply.withdraw"));
    await waitFor(() => expect(writes).toHaveLength(1));
  });
});
