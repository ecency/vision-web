import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";

// The real i18next with the real English strings, so the words the reader sees
// are what is checked (the shared mock returns only the key).
vi.mock("i18next", async () => {
  const { default: i18next } = await vi.importActual<typeof import("i18next")>("i18next");
  const { default: en } = await import("@/features/i18n/locales/en-US.json");
  const real = i18next.createInstance();
  await real.init({ lng: "en", initImmediate: false, resources: { en: { translation: { advent: en.advent } } } });
  return { __esModule: true, default: real };
});
// next/font only runs inside the Next build
vi.mock("@/features/advent/font", () => ({ adventFont: {} }));
vi.mock("@/features/advent/client", () => ({ adventApi: {} }));
vi.mock("@/features/advent/use-advent-session", () => ({ useAdventSession: () => ({}), sessionIsFor: () => false }));
vi.mock("@/features/advent/use-advent-wave", () => ({ useAdventWave: () => vi.fn() }));

import { Countdown } from "@/app/advent/_components/advent-calendar";

const HOUR = 3_600_000;
const FIRST = Date.UTC(2026, 11, 1);
const label = (hoursLeft: number) => {
  const { container } = render(<Countdown to={FIRST} now={FIRST - hoursLeft * HOUR} />);
  return container.querySelector(".adv-count > div")!.textContent;
};

describe("Advent countdown", () => {
  it("says day for one and days for any other number", () => {
    expect(label(12)).toBe("0days");
    expect(label(36)).toBe("1day");
    expect(label(60)).toBe("2days");
    // from 25 November: six days and more to go
    expect(label(6 * 24 + 1)).toBe("6days");
  });
});
