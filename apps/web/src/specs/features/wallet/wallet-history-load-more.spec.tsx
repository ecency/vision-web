import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { WalletHistoryLoadMore } from "@/app/(dynamicPages)/profile/[username]/wallet/(token)/_components/wallet-history-load-more";

// The wallet token pages (HIVE/HBD/HP) render this under the history card; until it
// existed nothing on those pages called fetchNextPage, so history stopped at the
// newest window (#1428).
describe("WalletHistoryLoadMore", () => {
  test("renders nothing when there is no next page", () => {
    const { container } = render(
      <WalletHistoryLoadMore hasNextPage={false} isFetchingNextPage={false} onLoadMore={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("requests the next page on click", () => {
    const onLoadMore = vi.fn();
    render(
      <WalletHistoryLoadMore hasNextPage={true} isFetchingNextPage={false} onLoadMore={onLoadMore} />
    );

    const button = screen.getByRole("button", { name: "g.load-more" });
    fireEvent.click(button);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  test("disables the button while the next page is loading", () => {
    const onLoadMore = vi.fn();
    render(
      <WalletHistoryLoadMore hasNextPage={true} isFetchingNextPage={true} onLoadMore={onLoadMore} />
    );

    const button = screen.getByRole("button", { name: "g.loading" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onLoadMore).not.toHaveBeenCalled();
  });
});
