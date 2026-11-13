import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// #2033: the Hive Engine token chart is disposed on unmount, once.

const m = vi.hoisted(() => {
  const chart = {
    remove: vi.fn(),
    addCandlestickSeries: vi.fn(() => ({ setData: vi.fn() })),
    timeScale: vi.fn(() => ({ fitContent: vi.fn() }))
  };
  return { chart, createChart: vi.fn(() => chart) };
});

vi.mock("lightweight-charts", () => ({ createChart: m.createChart }));
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

describe("HiveEngineChart cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes the chart once on unmount", () => {
    const { unmount } = render(<HiveEngineChart />);
    expect(m.createChart).toHaveBeenCalledTimes(1);
    expect(m.chart.remove).not.toHaveBeenCalled();
    unmount();
    expect(m.chart.remove).toHaveBeenCalledTimes(1);
  });
});
