import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = { lang: "en-US", theme: "day" };

vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: typeof store) => unknown) => selector(store)
}));

vi.mock("@ecency/sdk/wallets", () => ({
  EcencyWalletCurrency: { BNB: "BNB", BTC: "BTC", ETH: "ETH", SOL: "SOL" }
}));

import { TradingViewWidget } from "@/features/trading-view";

const scripts = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLScriptElement>("script[src*='embed-widget-advanced-chart']"));

describe("TradingViewWidget", () => {
  beforeEach(() => {
    store.lang = "en-US";
    store.theme = "day";
  });

  it("mounts one host with a widget div and the embed script", () => {
    const { container } = render(<TradingViewWidget symbol="HIVE" />);
    const all = scripts(container);
    expect(all).toHaveLength(1);
    expect(all[0].parentElement?.querySelector(".tradingview-widget-container__widget")).not.toBeNull();
  });

  it("keeps a stale (still loading) script attached to a parent on re-run", () => {
    const { container, rerender } = render(<TradingViewWidget symbol="HIVE" />);
    const [first] = scripts(container);

    store.theme = "night";
    act(() => {
      rerender(<TradingViewWidget symbol="HBD" />);
    });

    // The old script is no longer in the document, but must still have a
    // parent so TradingView's late `_replaceScript` does not hit null.
    expect(container.contains(first)).toBe(false);
    expect(first.parentNode).not.toBeNull();
    expect(first.parentElement?.querySelector(".tradingview-widget-container__widget")).not.toBeNull();

    const current = scripts(container);
    expect(current).toHaveLength(1);
    expect(JSON.parse(current[0].textContent ?? "{}")).toMatchObject({
      symbol: "CRYPTO:HBDUSD",
      theme: "dark"
    });
    expect(container.querySelectorAll(".tradingview-widget-host")).toHaveLength(1);
  });

  it.each([
    {
      name: "theme",
      change: () => {
        store.theme = "night";
      },
      before: { theme: "light" },
      after: { theme: "dark" }
    },
    {
      name: "locale",
      change: () => {
        store.lang = "es-ES";
      },
      before: { locale: "en-US" },
      after: { locale: "es-ES" }
    }
  ])("re-initialises the chart when only $name changes", ({ change, before, after }) => {
    const { container, rerender } = render(<TradingViewWidget symbol="HIVE" />);
    const [first] = scripts(container);
    const firstHost = container.querySelector(".tradingview-widget-host");
    expect(JSON.parse(first.textContent ?? "{}")).toMatchObject(before);

    change();
    act(() => {
      rerender(<TradingViewWidget symbol="HIVE" />);
    });

    // Host replaced, old script detached from the document but still parented.
    const hosts = container.querySelectorAll(".tradingview-widget-host");
    expect(hosts).toHaveLength(1);
    expect(hosts[0]).not.toBe(firstHost);
    expect(container.contains(first)).toBe(false);
    expect(first.parentNode).not.toBeNull();

    const current = scripts(container);
    expect(current).toHaveLength(1);
    expect(current[0]).not.toBe(first);
    expect(JSON.parse(current[0].textContent ?? "{}")).toMatchObject({
      symbol: "CRYPTO:HIVEUSD",
      ...after
    });
  });

  it("keeps the script parented after unmount", () => {
    const { container, unmount } = render(<TradingViewWidget symbol="HIVE" />);
    const [first] = scripts(container);
    unmount();
    expect(first.parentNode).not.toBeNull();
  });

  it("renders nothing for unsupported symbols", () => {
    const { container } = render(<TradingViewWidget symbol="UNKNOWN" />);
    expect(container.innerHTML).toBe("");
  });
});
