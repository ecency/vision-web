import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression for ECENCY-NEXT-1CSW: lightweight-charts v3 runs a kinetic-scroll
// requestAnimationFrame loop that is not cancelled by chart.remove(). Removing
// a chart mid-animation made the pending frame throw "Value is null". Charts
// must disable kinetic scroll and dispose themselves on unmount.

const chartMock = vi.hoisted(() => {
  const series = { setData: vi.fn() };
  const chart = {
    remove: vi.fn(),
    applyOptions: vi.fn(),
    resize: vi.fn(),
    options: vi.fn(() => ({ layout: {} })),
    addCandlestickSeries: vi.fn(() => series),
    addLineSeries: vi.fn(() => series),
    timeScale: vi.fn(() => ({
      fitContent: vi.fn(),
      subscribeVisibleLogicalRangeChange: vi.fn(),
      subscribeVisibleTimeRangeChange: vi.fn()
    }))
  };
  return { chart, createChart: vi.fn(() => chart) };
});

vi.mock("lightweight-charts", () => ({ createChart: chartMock.createChart }));
vi.mock("react-resize-detector", () => ({
  useResizeDetector: () => {
    const ref = React.useRef<HTMLDivElement | null>(document.createElement("div"));
    return { ref, width: 300, height: 200 };
  }
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: any) => selector({ theme: "day" })
}));
vi.mock("@ecency/sdk", () => ({
  getHiveEngineTokensMetricsQueryOptions: () => ({ queryKey: ["he-metrics"] })
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ token: "LEO" }) }));
vi.mock(
  "@/app/(dynamicPages)/profile/[username]/wallet/(token)/[token]/_helpers/token-symbol",
  () => ({ normalizeTokenSymbol: (t: string) => t })
);
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ data: [] })
}));

import { HiveEngineChart } from "@/app/(dynamicPages)/profile/[username]/wallet/(token)/[token]/_components/hive-engine-chart";

describe("lightweight-charts usage", () => {
  beforeEach(() => {
    chartMock.createChart.mockClear();
    chartMock.chart.remove.mockClear();
  });

  it("HiveEngineChart disables kinetic scroll and removes chart on unmount", () => {
    const { unmount } = render(<HiveEngineChart />);

    expect(chartMock.createChart).toHaveBeenCalledTimes(1);
    const options = (chartMock.createChart.mock.calls[0] as any[])[1];
    expect(options.kineticScroll).toEqual({ touch: false, mouse: false });

    unmount();
    expect(chartMock.chart.remove).toHaveBeenCalledTimes(1);
  });
});
