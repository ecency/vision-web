import { vi, describe, it, expect, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import i18next from "i18next";
import enUS from "@/features/i18n/locales/en-US.json";

/*
  #1825: the 402 toast rendered "You need {{required}} but have {{available}}."
  because one of the two useAiAssist call sites dropped the values. Both now go
  through getAiAssistErrorMessage. The i18next mock returns keys, so the specs
  assert keys and the values handed to t(); one test interpolates the real en-US
  string to prove the numbers land and no placeholder survives.
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
import { mockActiveUser, mockEntry, renderWithQueryClient } from "@/specs/test-utils";

const KEY_402 = "ai-assist.error-insufficient-points";
const KEY_402_GENERIC = "ai-assist.error-insufficient-points-generic";

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

const signedIn: ReturnType<typeof useActiveAccount> = {
  activeUser: mockActiveUser({ username: "alice" }),
  username: "alice",
  account: null,
  isLoading: false,
  isPending: false,
  isError: false,
  isSuccess: true,
  error: null,
  refetch: vi.fn()
};

beforeEach(() => {
  vi.mocked(i18next.t).mockClear();
  runAssist.mockReset();
  toastError.mockReset();
  vi.mocked(useActiveAccount).mockReturnValue(signedIn);
});

describe("getAiAssistErrorMessage", () => {
  it("hands required and available from the 402 payload to t()", () => {
    expect(getAiAssistErrorMessage(httpError(402, PAYLOAD_402))).toBe(KEY_402);
    expect(i18next.t).toHaveBeenLastCalledWith(KEY_402, { required: 5, available: 2.5 });
  });

  it("renders the numbers into the real en-US string with no placeholder left", () => {
    // i18next's own {{name}} substitution, against the shipped template.
    const interpolate = (key: string, values: Record<string, unknown>) =>
      key === KEY_402
        ? enUS["ai-assist"]["error-insufficient-points"].replace(
            /\{\{(\w+)\}\}/g,
            (m, name: string) => (name in values ? String(values[name]) : m)
          )
        : key;
    vi.mocked(i18next.t).mockImplementationOnce(interpolate as unknown as typeof i18next.t);

    const message = getAiAssistErrorMessage(httpError(402, PAYLOAD_402));
    expect(message).toBe("Insufficient points. You need 5 but have 2.5.");
    expect(message).not.toContain("{{");
    expect(enUS["ai-assist"]["error-insufficient-points-generic"]).not.toContain("{{");
  });

  it.each([
    ["an empty body", {}],
    ["no available", { required: 5 }],
    ["no required", { available: 2.5 }],
    ["non-numeric values", { required: "5", available: null }]
  ])("falls back to the value-free key on a 402 with %s", (_, data) => {
    expect(getAiAssistErrorMessage(httpError(402, data))).toBe(KEY_402_GENERIC);
    expect(i18next.t).not.toHaveBeenCalledWith(KEY_402, expect.anything());
  });

  it("falls back when the SDK attached no data at all", () => {
    expect(getAiAssistErrorMessage({ status: 402 })).toBe(KEY_402_GENERIC);
  });

  it("maps the other statuses", () => {
    expect(getAiAssistErrorMessage(httpError(422))).toBe("ai-assist.error-content-policy");
    expect(getAiAssistErrorMessage(httpError(429))).toBe("ai-assist.error-rate-limit");
    expect(getAiAssistErrorMessage(httpError(500))).toBe("ai-assist.error-generic");
    expect(getAiAssistErrorMessage(new Error("network"))).toBe("ai-assist.error-generic");
    expect(getAiAssistErrorMessage(undefined)).toBe("ai-assist.error-generic");
  });
});

describe("EntryPageListen summarize 402", () => {
  const entry = mockEntry({ body: Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ") });

  async function summarizeWith(err: unknown) {
    runAssist.mockRejectedValueOnce(err);
    renderWithQueryClient(<EntryPageListen entry={entry} />);
    fireEvent.click(screen.getByRole("button", { name: /g\.start/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    return toastError.mock.calls[0][0];
  }

  it("passes the payload values to the toast", async () => {
    expect(await summarizeWith(httpError(402, PAYLOAD_402))).toBe(KEY_402);
    expect(i18next.t).toHaveBeenCalledWith(KEY_402, { required: 5, available: 2.5 });
  });

  it("uses the value-free key when the payload lacks them", async () => {
    expect(await summarizeWith(httpError(402))).toBe(KEY_402_GENERIC);
  });
});

describe("AiAssist dialog 402", () => {
  async function submitWith(err: unknown) {
    runAssist.mockRejectedValueOnce(err);
    renderWithQueryClient(<AiAssist initialText={"x".repeat(200)} />);
    fireEvent.click(await screen.findByRole("button", { name: /^ai-assist\.action-summarize/ }));
    // The button is swapped out as prices and points load, so query it fresh.
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: /ai-assist\.submit-button/ }).disabled
      ).toBe(false)
    );
    fireEvent.click(screen.getByRole("button", { name: /ai-assist\.submit-button/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    return toastError.mock.calls[0][0];
  }

  it("passes the payload values to the toast", async () => {
    expect(await submitWith(httpError(402, PAYLOAD_402))).toBe(KEY_402);
    expect(i18next.t).toHaveBeenCalledWith(KEY_402, { required: 5, available: 2.5 });
  });

  it("does not invent a balance when the payload lacks one", async () => {
    // The old fallback rendered the action cost and a made-up "0" here.
    expect(await submitWith(httpError(402))).toBe(KEY_402_GENERIC);
  });
});
