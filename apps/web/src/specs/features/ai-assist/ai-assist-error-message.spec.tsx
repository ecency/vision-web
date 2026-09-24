import { vi, describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import i18next from "i18next";
import enUS from "@/features/i18n/locales/en-US.json";

/*
  #1825: the 402 toast rendered "You need {{required}} but have {{available}}."
  because one of the two useAiAssist call sites dropped the values. Both now go
  through getAiAssistErrorMessage; these specs pin the helper against the real
  en-US strings and pin that each call site actually routes its rejection through it.
*/

const { runAssist, toastError } = vi.hoisted(() => ({
  runAssist: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  useAiAssist: vi.fn(() => ({ mutateAsync: runAssist, isPending: false })),
  getAiAssistPriceQueryOptions: vi.fn(() => ({
    queryKey: ["spec", "ai-assist-prices"],
    queryFn: async () => [{ action: "summarize", cost: 5, free_remaining: 0 }]
  })),
  getPointsQueryOptions: vi.fn(() => ({
    queryKey: ["spec", "points"],
    queryFn: async () => ({ points: "100" })
  }))
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  getAccessToken: vi.fn(() => "access-token"),
  ensureValidToken: vi.fn(async () => "fresh-token")
}));
vi.mock("@/features/shared", () => ({ error: toastError, success: vi.fn() }));
vi.mock("@/features/shared/points-topup-cta", () => ({ PointsTopupCta: () => null }));
vi.mock("@/features/text-to-speech", () => ({
  useTts: vi.fn(() => ({ speechRef: { current: undefined }, hasPaused: false, hasStarted: false })),
  TextToSpeechSettingsDialog: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("@/api/translation", () => ({
  getTranslation: vi.fn(),
  getLanguages: vi.fn(async () => [])
}));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    CONFIG: { visionFeatures: { points: { enabled: true } } },
    useConfig: vi.fn(() => true)
  }
}));
vi.mock("@ui/modal", () => ({
  Modal: () => null,
  ModalBody: () => null,
  ModalHeader: () => null,
  ModalTitle: () => null
}));

import { getAiAssistErrorMessage } from "@/features/shared/ai-assist/ai-assist-error-message";
import { AiAssist } from "@/features/shared/ai-assist";
import { EntryPageListen } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-listen";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { mockEntry, renderWithQueryClient } from "@/specs/test-utils";

// Resolve keys against the real en-US table with i18next's {{name}} syntax, so an
// unfilled placeholder shows up in the output exactly as a user would see it.
function translate(key: string, values?: Record<string, unknown>): string {
  const raw = key.split(".").reduce<any>((node, part) => node?.[part], enUS);
  if (typeof raw !== "string") return key;
  return raw.replace(/\{\{(\w+)\}\}/g, (m, name) =>
    values && name in values ? String(values[name]) : m
  );
}

function httpError(status: number, data: Record<string, unknown> = {}) {
  return Object.assign(new Error(`failed with status ${status}`), { status, data });
}

// The body ePoints returns for a paid action the user cannot afford.
const PAYLOAD_402 = {
  error: "insufficient_points",
  message: "Not enough points. Free uses exhausted for today.",
  required: 5,
  available: 2.5
};

beforeEach(() => {
  vi.mocked(i18next.t).mockImplementation(((key: string, values?: Record<string, unknown>) =>
    translate(key, values)) as any);
  runAssist.mockReset();
  toastError.mockReset();
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: { username: "alice" },
    username: "alice"
  } as any);
});

describe("getAiAssistErrorMessage", () => {
  it("fills required and available from the 402 payload", () => {
    expect(getAiAssistErrorMessage(httpError(402, PAYLOAD_402))).toBe(
      "Insufficient points. You need 5 but have 2.5."
    );
  });

  it.each([
    ["an empty body", {}],
    ["no available", { required: 5 }],
    ["no required", { available: 2.5 }],
    ["non-numeric values", { required: "5", available: null }]
  ])("falls back to the value-free message on a 402 with %s", (_, data) => {
    const message = getAiAssistErrorMessage(httpError(402, data));
    expect(message).toBe("Insufficient points for this AI action.");
    expect(message).not.toContain("{{");
  });

  it("falls back when the SDK attached no data at all", () => {
    expect(getAiAssistErrorMessage({ status: 402 })).toBe(
      "Insufficient points for this AI action."
    );
  });

  it("maps the other statuses", () => {
    expect(getAiAssistErrorMessage(httpError(422))).toBe(enUS["ai-assist"]["error-content-policy"]);
    expect(getAiAssistErrorMessage(httpError(429))).toBe(enUS["ai-assist"]["error-rate-limit"]);
    expect(getAiAssistErrorMessage(httpError(500))).toBe(enUS["ai-assist"]["error-generic"]);
    expect(getAiAssistErrorMessage(new Error("network"))).toBe(enUS["ai-assist"]["error-generic"]);
    expect(getAiAssistErrorMessage(undefined)).toBe(enUS["ai-assist"]["error-generic"]);
  });
});

describe("EntryPageListen summarize 402", () => {
  const entry = mockEntry({ body: Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ") });

  async function summarizeWith(err: unknown) {
    runAssist.mockRejectedValueOnce(err);
    render(<EntryPageListen entry={entry} />);
    fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    return toastError.mock.calls[0][0] as string;
  }

  it("shows the values from the payload", async () => {
    expect(await summarizeWith(httpError(402, PAYLOAD_402))).toBe(
      "Insufficient points. You need 5 but have 2.5."
    );
  });

  it("never shows raw placeholders when the payload lacks them", async () => {
    expect(await summarizeWith(httpError(402))).toBe("Insufficient points for this AI action.");
  });
});

describe("AiAssist dialog 402", () => {
  async function submitWith(err: unknown) {
    runAssist.mockRejectedValueOnce(err);
    renderWithQueryClient(<AiAssist initialText={"x".repeat(200)} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Recap/ }));
    // The button is swapped out as prices and points load, so query it fresh.
    await waitFor(() =>
      expect((screen.getByRole("button", { name: /Run AI/ }) as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.click(screen.getByRole("button", { name: /Run AI/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    return toastError.mock.calls[0][0] as string;
  }

  it("shows the values from the payload", async () => {
    expect(await submitWith(httpError(402, PAYLOAD_402))).toBe(
      "Insufficient points. You need 5 but have 2.5."
    );
  });

  it("does not invent a balance when the payload lacks one", async () => {
    // The old fallback rendered the action cost and a made-up "0" here.
    expect(await submitWith(httpError(402))).toBe("Insufficient points for this AI action.");
  });
});
