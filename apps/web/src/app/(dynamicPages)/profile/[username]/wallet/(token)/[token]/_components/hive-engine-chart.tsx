"use client";

import { useGlobalStore } from "@/core/global-store";
import { getHiveEngineTokensMetricsQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { createChart, IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useResizeDetector } from "react-resize-detector";
import { useMount } from "react-use";
import { normalizeTokenSymbol } from "../_helpers/token-symbol";

export function HiveEngineChart() {
  const theme = useGlobalStore((s) => s.theme);

  const { token } = useParams();
  const tokenSymbol = normalizeTokenSymbol(token as string);
  const { ref: chartContainerRef } = useResizeDetector();

  const chartRef = useRef<IChartApi | null>(null);
  const candleStickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const { data } = useQuery({
    ...getHiveEngineTokensMetricsQueryOptions(tokenSymbol ?? "", "hourly"),
    enabled: Boolean(tokenSymbol),
    select: (items) =>
      items
        .map((item) => ({
          open: +item.open,
          close: +item.close,
          high: +item.high,
          low: +item.low,
          volume: +item.quoteVolume,
          time: Math.floor(
            dayjs(item.timestamp * 1000)
              .toDate()
              .getTime() / 1000
          ) as Time
        }))
        .sort((a, b) => Number(a.time) - Number(b.time))
  });

  useMount(() => {
    if (!chartContainerRef.current || chartRef.current) {
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

    candleStickSeriesRef.current = chart.addCandlestickSeries({
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
    });
  });

  // Dispose the chart on unmount so it doesn't leak listeners/canvases.
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleStickSeriesRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (candleStickSeriesRef.current && data) {
      candleStickSeriesRef.current.setData([]);
      candleStickSeriesRef.current.setData([...data]);

      // Fit chart to data bounds
      if (chartRef.current && data.length > 0) {
        chartRef.current.timeScale().fitContent();
      }
    }
  }, [data]);

  return (
    <div className="bg-white rounded-xl mb-4">
      <div className="p-4 text-sm text-gray-600 dark:text-gray-400">Market</div>
      <div className="px-4 pb-4">
        <div className="h-[200px]" ref={chartContainerRef} />
      </div>
    </div>
  );
}
