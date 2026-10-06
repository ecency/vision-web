import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import dayjs from "@/utils/dayjs";
import "dayjs/locale/ru";
import { Datepicker } from "@/features/ui";

// Header labels and grid columns must start on the same weekday, whatever
// weekday the active dayjs locale starts its week on.
function renderedColumns() {
  const { container } = render(
    <Datepicker value={undefined} minDate={undefined} onChange={() => {}} />
  );
  const grid = container.querySelector(".grid-cols-7")!;
  const cells = Array.from(grid.children);
  const header = cells.slice(0, 7).map((c) => c.textContent);
  const firstDay = Number(cells[7].textContent);
  return { header, firstDay };
}

const format = (date: Date) =>
  new Intl.DateTimeFormat("en", { weekday: "short" }).format(date);

describe("Datepicker weekday alignment", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // October 2026 starts on a Thursday
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0));
  });

  afterEach(() => {
    dayjs.locale("en");
    vi.useRealTimers();
  });

  it("starts on Sunday for a Sunday-first locale", () => {
    dayjs.locale("en");
    const { header, firstDay } = renderedColumns();
    expect(header[0]).toBe("Sun");
    expect(firstDay).toBe(27); // Sun Sep 27, 2026
  });

  it("labels Monday first when the locale week starts on Monday", () => {
    dayjs.locale("ru");
    const { header, firstDay } = renderedColumns();
    expect(firstDay).toBe(28); // Mon Sep 28, 2026
    expect(header[0]).toBe(format(new Date(2026, 8, 28)));
    expect(header[6]).toBe(format(new Date(2026, 9, 4)));
  });

  it("opens on the selected month even when its first days fall before Monday", () => {
    dayjs.locale("en");
    const { container } = render(
      <Datepicker value={new Date(2026, 9, 2, 10, 0)} minDate={undefined} onChange={() => {}} />
    );
    expect(container.textContent).toContain("2026");
    expect(container.querySelector("b")!.textContent).toBe("October");
  });
});
