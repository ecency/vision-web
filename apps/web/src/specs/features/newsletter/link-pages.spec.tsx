import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmPage } from "@/app/newsletter/confirm/[token]/_page";
import { UnsubscribePage } from "@/app/newsletter/unsubscribe/[token]/_page";
import { renderWithQueryClient } from "@/specs/test-utils";

const fetchMock = vi.fn();
const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
const TOKEN = "abcdefghijklmnopqrstuvwx";

describe("confirm and unsubscribe pages", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("confirm page inspects on load, labels a site digest as the Ecency digest, and confirms on click", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === `/api/newsletter/confirm/${TOKEN}` && (init?.method ?? "GET") === "GET") {
        return json(200, { email: "al***@example.com", subscriptions: [{ type: "site", target: "ecency", cadence: "weekly", status: "pending_confirmation" }] });
      }
      if (url === `/api/newsletter/confirm/${TOKEN}` && init?.method === "POST") {
        return json(200, { confirmed: true, email: "al***@example.com", subscriptions: [{ type: "site", target: "ecency", cadence: "weekly", status: "active" }] });
      }
      return json(404, {});
    });
    renderWithQueryClient(<ConfirmPage token={TOKEN} />);
    expect(await screen.findByText(/newsletter\.row-site/)).toBeInTheDocument();
    expect(screen.queryByText(/newsletter\.row-own/)).not.toBeInTheDocument();
    // Loading the page confirmed nothing.
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "newsletter.confirm-button" }));
    await waitFor(() => expect(screen.getByText("newsletter.confirm-done")).toBeInTheDocument());
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(1);
  });

  it("unsubscribe page inspects on load and labels the site digest correctly", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === `/api/newsletter/unsubscribe/${TOKEN}` && (init?.method ?? "GET") === "GET") {
        return json(200, { email: "al***@example.com", subscription: { type: "site", target: "ecency", cadence: "weekly", ended: false }, otherSubscriptions: 0 });
      }
      return json(404, {});
    });
    renderWithQueryClient(<UnsubscribePage token={TOKEN} />);
    // The intro interpolates the label; the button carries it too.
    expect(await screen.findByRole("button", { name: "newsletter.unsubscribe-one" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(0);
  });
});
