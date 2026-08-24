import { vi, describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import "@testing-library/jest-dom";

vi.mock("@/utils", async () => {
  const actual = await vi.importActual("@/utils");
  return { ...actual as any };
});

import { TimeLabel } from "@/features/shared/time-label";
import { dateToFormattedUtc, dateToRelative } from "@/utils";
import { hydrateRoot, type Root } from "react-dom/client";
import { act } from "react";

/*
  TimeLabel's display initializer is server-only (typeof window guard), so a
  jsdom renderToString would take the CLIENT branch. Stub window off to
  exercise the real server path.
*/
function renderServerHtml(ui: Parameters<typeof renderToString>[0]): string {
  const win = globalThis.window;
  // @ts-expect-error deliberately simulating the server environment
  delete globalThis.window;
  try {
    return renderToString(ui);
  } finally {
    globalThis.window = win;
  }
}

describe("TimeLabel SSR output (#1662)", () => {
  // A fixed offset from now, so the relative form is deterministic per run.
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();

  it("server-renders the relative form for the default mode, not the UTC datetime", () => {
    const html = renderServerHtml(<TimeLabel created={tenDaysAgo} />);
    expect(html).toContain(`>${dateToRelative(tenDaysAgo)}<`);
    expect(html).not.toContain(`>${dateToFormattedUtc(tenDaysAgo)}<`);
  });

  it("server-renders the UTC datetime for absolute mode (viewer timezone unknown)", () => {
    const html = renderServerHtml(<TimeLabel created={tenDaysAgo} mode="absolute" />);
    expect(html).toContain(`>${dateToFormattedUtc(tenDaysAgo)}<`);
  });

  it("corrects a stale cached SSR value after hydration", async () => {
    /*
      Edge-cached pages serve HTML whose SSR-computed relative value can be a
      unit behind by hydration time. suppressHydrationWarning makes React keep
      the server text on mismatch, so the correction must be a real state
      transition; a client-side initializer that pre-computes the new value
      makes the mount effect bail out on state equality and the DOM stays
      stale (reproduced with React 19).
    */
    vi.useFakeTimers();
    try {
      const created = new Date("2026-01-01T00:00:00Z").toISOString();
      vi.setSystemTime(new Date("2026-01-04T12:00:00Z"));
      const serverValue = dateToRelative(created);
      const html = renderServerHtml(<TimeLabel created={created} />);
      expect(html).toContain(`>${serverValue}<`);

      // The viewer loads the cached HTML 25 hours later: one relative unit on.
      vi.setSystemTime(new Date("2026-01-05T13:00:00Z"));
      const clientValue = dateToRelative(created);
      expect(clientValue).not.toBe(serverValue);

      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);
      let root: Root | undefined;
      await act(async () => {
        root = hydrateRoot(container, <TimeLabel created={created} />);
      });
      expect(container.querySelector("span")?.textContent).toBe(clientValue);
      await act(async () => root?.unmount());
      container.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TimeLabel", () => {
  const created = "2024-06-15T12:00:00Z";

  it("renders a span with date class", () => {
    const { container } = render(<TimeLabel created={created} />);
    const span = container.querySelector("span.date");
    expect(span).toBeInTheDocument();
    // After useEffect, shows relative time or formatted date
    expect(span?.textContent).toBeTruthy();
  });

  it("has a title attribute with date info", () => {
    const { container } = render(<TimeLabel created={created} />);
    const span = container.querySelector("span.date");
    expect(span).toHaveAttribute("title");
  });

  it("renders empty for empty created", () => {
    const { container } = render(<TimeLabel created="" />);
    const span = container.querySelector("span.date");
    expect(span?.textContent).toBe("");
  });
});
