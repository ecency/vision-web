import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #2033: the advanced market chart is disposed on unmount, and nothing it
// started on mount (the 10s first page ask, the time range listener) outlives it.

const m = vi.hoisted(() => {
  const timeScale = {
    subscribeVisibleTimeRangeChange: vi.fn(),
    unsubscribeVisibleTimeRangeChange: vi.fn()
  };
  const chart = {
    remove: vi.fn(),
    resize: vi.fn(),
    options: vi.fn(() => ({ layout: {} })),
    addCandlestickSeries: vi.fn(() => ({ setData: vi.fn() })),
    timeScale: vi.fn(() => timeScale)
  };
  return { chart, timeScale, createChart: vi.fn(() => chart), fetchNextPage: vi.fn() };
});

vi.mock("lightweight-charts", () => ({ createChart: m.createChart }));
vi.mock("react-resize-detector", () => ({
  useResizeDetector: () => {
    const ref = React.useRef<HTMLDivElement | null>(document.createElement("div"));
    return { ref, width: 300, height: 200 };
  }
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: <T,>(selector: (s: { theme: string }) => T) => selector({ theme: "day" })
}));
vi.mock("@/app/market/advanced/_components/market-advanced-mode-widget", () => ({
  MarketAdvancedModeWidget: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}));
vi.mock("@/app/market/advanced/_components/api", () => ({
  useMarketBucketSizeQuery: () => ({ data: [] }),
  useTradingViewQuery: () => ({ data: undefined, fetchNextPage: m.fetchNextPage, isFetchingNextPage: false })
}));
vi.mock("@/utils", () => ({ useInfiniteDataFlow: () => [] }));
vi.mock("@/utils/local-storage", () => ({ PREFIX: "ecency" }));
vi.mock("@ui/dropdown", () => ({
  Dropdown: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownToggle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}));
vi.mock("@ui/button", () => ({ Button: ({ children }: { children?: React.ReactNode }) => <button>{children}</button> }));

import { TradingViewWidget } from "@/app/market/advanced/_components/trading-view-widget";

describe("TradingViewWidget cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // On mount the 300ms debounce also asks for the next page (no range is known
  // yet). Each case lets that ask land first, so what is counted after it can
  // only be the 10s first page timer.
  const mountPastDebounce = () => {
    const view = render(<TradingViewWidget widgetTypeChanged={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(m.fetchNextPage).toHaveBeenCalledTimes(1);
    m.fetchNextPage.mockClear();
    return view;
  };

  it("removes the chart once on unmount and does not ask for the next page after it", () => {
    const { unmount } = mountPastDebounce();
    expect(m.createChart).toHaveBeenCalledTimes(1);
    expect(m.chart.remove).not.toHaveBeenCalled();

    unmount();
    expect(m.chart.remove).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(m.fetchNextPage).not.toHaveBeenCalled();
  });

  it("still asks for the next page 10s after mount while mounted", () => {
    const { unmount } = mountPastDebounce();
    act(() => {
      vi.advanceTimersByTime(8_999);
    });
    expect(m.fetchNextPage).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(m.fetchNextPage).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("stops listening to the visible time range before removing the chart", () => {
    const { unmount } = render(<TradingViewWidget widgetTypeChanged={() => {}} />);
    const listener = m.timeScale.subscribeVisibleTimeRangeChange.mock.calls[0]?.[0];
    expect(listener).toBeTypeOf("function");
    unmount();
    expect(m.timeScale.unsubscribeVisibleTimeRangeChange).toHaveBeenCalledWith(listener);
    expect(m.timeScale.unsubscribeVisibleTimeRangeChange.mock.invocationCallOrder[0]).toBeLessThan(
      m.chart.remove.mock.invocationCallOrder[0]
    );
  });
});
