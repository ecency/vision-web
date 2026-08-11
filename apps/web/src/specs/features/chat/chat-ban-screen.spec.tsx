import { render, screen, act } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { ChatBanScreen } from "@/features/chat/components/chat-ban-screen";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatBanScreen", () => {
  it("explains the ban rather than showing operator copy", () => {
    render(<ChatBanScreen info={{ bannedUntil: Date.now() + 48 * 3_600_000, reason: "spray" }} />);

    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("same message went to several channels");
    expect(notice.textContent).toContain("You can still read chat.");
    expect(notice.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("counts down instead of freezing at first render", () => {
    render(<ChatBanScreen info={{ bannedUntil: Date.now() + 10 * 60_000, reason: "manual" }} />);
    expect(screen.getByRole("status").textContent).toContain("10 minutes");

    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    expect(screen.getByRole("status").textContent).toContain("5 minutes");
  });

  it("calls onExpire once the ban lapses, so bootstrap can be retried without a reload", () => {
    const onExpire = vi.fn();
    render(
      <ChatBanScreen info={{ bannedUntil: Date.now() + 60_000, reason: "spray" }} onExpire={onExpire} />
    );

    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(90_000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("does not keep firing onExpire after expiry", () => {
    const onExpire = vi.fn();
    render(
      <ChatBanScreen info={{ bannedUntil: Date.now() + 30_000, reason: "spray" }} onExpire={onExpire} />
    );

    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("survives a multi-year ban without the timer overflowing", () => {
    const onExpire = vi.fn();
    // 3y exceeds the 32-bit setTimeout limit; a delay derived from bannedUntil would fire at once
    render(
      <ChatBanScreen
        info={{ bannedUntil: Date.now() + 3 * 365 * 86_400_000, reason: "mass-dm" }}
        onExpire={onExpire}
      />
    );

    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("days");
  });
});
