import { describe, expect, it, vi } from "vitest";

// The global setup mocks i18next as `t: key => key`, which would make every assertion here a
// tautology about key names. This file is specifically about the copy a banned user reads, so it
// substitutes a mock that honours defaultValue and {{...}} interpolation the way i18next does.
vi.mock("i18next", () => ({
  __esModule: true,
  default: {
    t: (key: string, opts?: Record<string, unknown>) => {
      let out = String(opts?.defaultValue ?? key);
      for (const [k, v] of Object.entries(opts ?? {})) {
        if (k === "defaultValue") continue;
        out = out.replace(new RegExp(`{{${k}}}`, "g"), String(v));
      }
      return out;
    }
  }
}));

import {
  BAN_NOTICE_TICK_MS,
  formatBanRemaining,
  formatChatBanNotice,
  getChatBanInfo
} from "@/features/chat/chat-ban-notice";

const NOW = 1_800_000_000_000;
const mins = (n: number) => NOW + n * 60_000;
const hours = (n: number) => NOW + n * 3_600_000;
const days = (n: number) => NOW + n * 86_400_000;

describe("getChatBanInfo", () => {
  it("extracts a live ban from a rejected request", () => {
    const info = getChatBanInfo({ status: 403, bannedUntil: hours(48), reason: "spray" }, NOW);
    expect(info).toEqual({ bannedUntil: hours(48), reason: "spray" });
  });

  it("ignores an already-expired ban so a stale error can't pin the notice open", () => {
    expect(getChatBanInfo({ status: 403, bannedUntil: NOW - 1 }, NOW)).toBeNull();
  });

  it("returns null for ordinary failures", () => {
    expect(getChatBanInfo({ status: 500 }, NOW)).toBeNull();
    expect(getChatBanInfo(new Error("network"), NOW)).toBeNull();
    expect(getChatBanInfo(null, NOW)).toBeNull();
  });

  it("tolerates a missing reason (bans predating the reason prop)", () => {
    expect(getChatBanInfo({ bannedUntil: hours(1) }, NOW)?.reason).toBeUndefined();
  });

  it("drops a non-string reason rather than rendering it", () => {
    expect(getChatBanInfo({ bannedUntil: hours(1), reason: { x: 1 } }, NOW)?.reason).toBeUndefined();
  });
});

describe("formatBanRemaining", () => {
  it("scales the unit to the magnitude", () => {
    expect(formatBanRemaining(mins(30), NOW)).toContain("30 minutes");
    expect(formatBanRemaining(hours(5), NOW)).toContain("5 hours");
    expect(formatBanRemaining(days(2), NOW)).toContain("2 days");
  });

  it("never promises an unlock that has not happened", () => {
    // rounds up, so a ban with seconds left never reads as '0 minutes'
    expect(formatBanRemaining(NOW + 30_000, NOW)).toBe("in under a minute");
    expect(formatBanRemaining(NOW, NOW)).toBe("in under a minute");
    expect(formatBanRemaining(NOW - 10_000, NOW)).toBe("in under a minute");
  });

  it("uses hours up to two days, then days", () => {
    expect(formatBanRemaining(hours(47), NOW)).toContain("hours");
    expect(formatBanRemaining(hours(49), NOW)).toContain("days");
  });

  it("never phrases a count as 1, so no band can read '1 hours'", () => {
    // every band hands {{count}} >= 2; the 1-hour case falls into the minutes band
    for (const until of [mins(59), mins(89), hours(1), hours(1.4), hours(2), days(1), days(400)]) {
      const text = formatBanRemaining(until, NOW);
      const m = text.match(/about (\d+)/);
      if (m) {
        expect(Number(m[1])).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("handles a multi-year ban without overflowing", () => {
    // 3y is the containment default. It must render as days, not silently degrade.
    const threeYears = NOW + 3 * 365 * 86_400_000;
    expect(formatBanRemaining(threeYears, NOW)).toContain("1095 days");
  });
});

describe("BAN_NOTICE_TICK_MS", () => {
  it("stays inside the 32-bit setTimeout limit", () => {
    // Deriving a timer delay from bannedUntil overflows for long bans: setTimeout takes a
    // 32-bit signed delay, so a 3-year ban fires in ~1ms and clears its own notice instantly.
    // The tick is a fixed bounded interval precisely so that cliff cannot be reached.
    expect(BAN_NOTICE_TICK_MS).toBeGreaterThan(0);
    expect(BAN_NOTICE_TICK_MS).toBeLessThan(2_147_483_647);

    const threeYearsMs = 3 * 365 * 86_400_000;
    expect(threeYearsMs).toBeGreaterThan(2_147_483_647); // the delay we must never pass to setTimeout
  });
});

describe("formatChatBanNotice", () => {
  it("explains a spray timeout in plain terms", () => {
    const text = formatChatBanNotice({ bannedUntil: hours(48), reason: "spray" }, NOW);
    expect(text).toContain("same message went to several channels");
    expect(text).toContain("You can still read chat.");
    expect(text).toContain("2 days");
  });

  it("explains a mass-DM ban differently", () => {
    const text = formatChatBanNotice({ bannedUntil: days(365), reason: "mass-dm" }, NOW);
    expect(text).toContain("many people at once");
  });

  it("falls back to generic copy for manual and unknown reasons", () => {
    for (const reason of ["manual", "something-new-from-a-later-service", undefined]) {
      const text = formatChatBanNotice({ bannedUntil: hours(3), reason }, NOW);
      expect(text).toContain("paused from posting");
      expect(text).toContain("3 hours");
    }
  });

  it("never leaks operator-facing detail to the banned user", () => {
    const text = formatChatBanNotice({ bannedUntil: hours(48), reason: "spray" }, NOW);
    // no ISO timestamp, no prop name, no account handle, no thresholds
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(text).not.toContain("ecency_chat");
    expect(text).not.toContain("@");
  });
});
