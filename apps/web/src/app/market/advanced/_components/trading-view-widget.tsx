import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarketAdvancedModeWidget } from "./market-advanced-mode-widget";
import useLocalStorage from "react-use/lib/useLocalStorage";
import { TradingViewQueryDataItem, useMarketBucketSizeQuery, useTradingViewQuery } from "./api";
import { Widget } from "@/app/market/advanced/_advanced-mode/types/layout.type";
import { PREFIX } from "@/utils/local-storage";
import { useGlobalStore } from "@/core/global-store";
import i18next from "i18next";
import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle } from "@ui/dropdown";
import { Button } from "@ui/button";
import { useInfiniteDataFlow } from "@/utils";
import { useDebounce, useMount } from "react-use";
import { createChart, IChartApi, ISeriesApi, Time, TimeRange } from "lightweight-charts";
import { useResizeDetector } from "react-resize-detector";

interface Props {
  widgetTypeChanged: (type: Widget) => void;
}

export const TradingViewWidget = ({ widgetTypeChanged }: Props) => {
  const theme = useGlobalStore((s) => s.theme);

  const { ref: chartContainerRef, width, height } = useResizeDetector();
  const chartRef = useRef<IChartApi | null>(null);

  const [bucketSeconds, setBucketSeconds] = useLocalStorage<number>(PREFIX + "_amml_tv_bs", 300);
  const [candleStickSeries, setCandleStickSeries] = useState<ISeriesApi<"Candlestick">>();
  const [lastTimeRange, setLastTimeRange] = useState<TimeRange>();

  const { data: bucketSecondsList } = useMarketBucketSizeQuery();
  const {
    data: dataPages,
    fetchNextPage,
    isFetchingNextPage
  } = useTradingViewQuery(bucketSeconds ?? 300);

  const data = useInfiniteDataFlow(dataPages);
  const uniqueData = useMemo(
    () =>
      Array.from(
        data
          .reduce(
            (acc, item) => acc.set(item.time, item),
            new Map<Time, TradingViewQueryDataItem>()
          )
          .values()
      ).sort((a, b) => Number(a.time) - Number(b.time)),
    [data]
  );

  useMount(() => {
    if (!chartContainerRef.current) {
      return;
    }

    const chartOptions = {
      rightPriceScale: {
        scaleMargins: {
          top: 0.3,
          bottom: 0.25
        },
        borderVisible: false
      },
      timeScale: {
        timeVisible: true
      },
      // Kinetic scrolling runs a requestAnimationFrame loop in lightweight-charts
      // v3 that is never cancelled on chart.remove(). If the component unmounts
      // mid-animation, the pending frame dereferences the destroyed pane and
      // throws "Value is null" (ECENCY-NEXT-1CSW). Keep it off.
      kineticScroll: {
        touch: false,
        mouse: false
      },
      layout: {
        background: {
          color: "transparent"
        },
        textColor: theme == "night" ? "#fff" : "#000"
      },
      grid: {
        horzLines: {
          visible: true,
          color: "rgba(100, 100, 100, 0.5)",
          style: 1,
          width: 1
        },
        vertLines: {
          visible: true,
          color: "rgba(100, 100, 100, 0.5)",
          style: 1,
          width: 1
        }
      }
    };
    const chart = createChart(chartContainerRef.current, chartOptions);
    chartRef.current = chart;

    chart
      .timeScale()
      .subscribeVisibleTimeRangeChange((timeRange) => setLastTimeRange(timeRange ?? undefined));

    setCandleStickSeries(
      chart.addCandlestickSeries({
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderVisible: false,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        priceFormat: {
          type: "price",
          precision: 5,
          minMove: 0.00001
        }
      })
    );

    setTimeout(() => fetchNextPage(), 10000);
  });

  useDebounce(
    () => {
      if (lastTimeRange?.from === uniqueData[0]?.time) {
        fetchNextPage();
      }
    },
    300,
    [lastTimeRange, uniqueData, fetchNextPage]
  );

  useEffect(() => {
    chartRef.current?.resize(width ?? 0, height ?? 0);
  }, [width, height]);

  // Dispose the chart on unmount so it doesn't leak listeners/canvases.
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (candleStickSeries) {
      candleStickSeries.setData([]);
      candleStickSeries.setData(
        uniqueData.map((item) => ({
          ...item,
          value: item.volume / 1000
        }))
      );
    }
  }, [candleStickSeries, uniqueData]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.options().layout.textColor = theme == "night" ? "#fff" : "#161d26";
    }
  }, [theme]);

  const getBucketSecondsLabel = useCallback((bucketSeconds: number) => {
    switch (bucketSeconds) {
      case 15:
        return "15s";
      case 60:
        return "1m";
      case 300:
        return "5m";
      case 3600:
        return "1h";
      case 86400:
        return "1d";
      default:
        return "";
    }
  }, []);

  return (
    <MarketAdvancedModeWidget
      className="market-advanced-mode-tv-widget pb-4"
      type={Widget.TradingView}
      title={
        <>
          <b>{i18next.t("market.advanced.chart")}</b>
          <small className="pl-1">({getBucketSecondsLabel(bucketSeconds ?? 300)})</small>
        </>
      }
      widgetTypeChanged={widgetTypeChanged}
      settingsClassName="flex"
      additionalSettings={
        <Dropdown>
          <DropdownToggle>
            <Button appearance="link">Bucket size</Button>
          </DropdownToggle>
          <DropdownMenu>
            {bucketSecondsList
              ?.map((size) => ({
                label: `${getBucketSecondsLabel(size)}`,
                selected: bucketSeconds === size,
                onClick: () => setBucketSeconds(size)
              }))
              .map((item, i) => (
                <DropdownItem key={i} selected={item.selected} onClick={item.onClick}>
                  {item.label}
                </DropdownItem>
              ))}
          </DropdownMenu>
        </Dropdown>
      }
    >
      <div className="market-advanced-mode-trading-view-widget" ref={chartContainerRef} />
    </MarketAdvancedModeWidget>
  );
};
