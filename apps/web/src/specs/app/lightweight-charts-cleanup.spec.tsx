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
      subscribeVisibleTimeRangeChange: vi.fn(),
      unsubscribeVisibleTimeRangeChange: vi.fn()
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
  getHiveEngineTokensMetricsQueryOptions: () => ({ queryKey: ["he-metrics"] }),
  getBalanceHistoryInfiniteQueryOptions: () => ({ queryKey: ["balance-history"] }),
  getDynamicPropsQueryOptions: () => ({ queryKey: ["dynamic-props"] }),
  vestsToHp: (v: number) => v
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ token: "LEO" }) }));
vi.mock(
  "@/app/(dynamicPages)/profile/[username]/wallet/(token)/[token]/_helpers/token-symbol",
  () => ({ normalizeTokenSymbol: (t: string) => t })
);
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ data: [] }),
  useInfiniteQuery: () => ({
    data: {
      pages: [
        {
          currentPage: 1,
          entries: [
            { timestamp: "2026-01-01T00:00:00", balance: "1000", operation_id: "1" },
            { timestamp: "2026-01-02T00:00:00", balance: "2000", operation_id: "2" }
          ]
        }
      ]
    },
    isLoading: false,
    isFetching: false,
    hasNextPage: false,
    fetchNextPage: vi.fn()
  })
}));
vi.mock("@/features/ui/spinner", () => ({ Spinner: () => null }));

// TradingViewWidget dependencies
vi.mock("@/app/market/advanced/_components/market-advanced-mode-widget", () => ({
  MarketAdvancedModeWidget: ({ children }: any) => <div>{children}</div>
}));
vi.mock("@/app/market/advanced/_components/api", () => ({
  useMarketBucketSizeQuery: () => ({ data: [] }),
  useTradingViewQuery: () => ({
    data: undefined,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false
  })
}));
vi.mock("@/utils", () => ({ useInfiniteDataFlow: () => [] }));
vi.mock("@/utils/local-storage", () => ({ PREFIX: "ecency" }));
vi.mock("@ui/dropdown", () => ({
  Dropdown: ({ children }: any) => <div>{children}</div>,
  DropdownToggle: ({ children }: any) => <div>{children}</div>,
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownItem: ({ children }: any) => <div>{children}</div>
}));
vi.mock("@ui/button", () => ({ Button: ({ children }: any) => <button>{children}</button> }));

import { HiveEngineChart } from "@/app/(dynamicPages)/profile/[username]/wallet/(token)/[token]/_components/hive-engine-chart";
import { BalanceHistoryChart } from "@/app/(dynamicPages)/profile/[username]/wallet/(token)/_components/balance-history-chart";
import { TradingViewWidget } from "@/app/market/advanced/_components/trading-view-widget";

const cases: Array<[string, () => React.ReactElement]> = [
  ["HiveEngineChart", () => <HiveEngineChart />],
  ["BalanceHistoryChart", () => <BalanceHistoryChart username="alice" coinType="HIVE" />],
  ["TradingViewWidget", () => <TradingViewWidget widgetTypeChanged={() => {}} />]
];

describe("lightweight-charts usage", () => {
  beforeEach(() => {
    chartMock.createChart.mockClear();
    chartMock.chart.remove.mockClear();
  });

  it.each(cases)("%s disables kinetic scroll and removes chart on unmount", (_name, element) => {
    const { unmount } = render(element());

    expect(chartMock.createChart).toHaveBeenCalledTimes(1);
    const options = (chartMock.createChart.mock.calls[0] as any[])[1];
    expect(options.kineticScroll).toEqual({ touch: false, mouse: false });

    expect(chartMock.chart.remove).not.toHaveBeenCalled();
    unmount();
    expect(chartMock.chart.remove).toHaveBeenCalledTimes(1);
  });
});
