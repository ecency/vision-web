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

describe("TimeLabel SSR output (#1662)", () => {
  // A fixed offset from now, so the relative form is deterministic per run.
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();

  it("server-renders the relative form for the default mode, not the UTC datetime", () => {
    const html = renderToString(<TimeLabel created={tenDaysAgo} />);
    expect(html).toContain(`>${dateToRelative(tenDaysAgo)}<`);
    expect(html).not.toContain(`>${dateToFormattedUtc(tenDaysAgo)}<`);
  });

  it("server-renders the UTC datetime for absolute mode (viewer timezone unknown)", () => {
    const html = renderToString(<TimeLabel created={tenDaysAgo} mode="absolute" />);
    expect(html).toContain(`>${dateToFormattedUtc(tenDaysAgo)}<`);
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
