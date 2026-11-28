import { describe, expect, it } from "vitest";
import {
  FIRST_YEAR,
  LAST_YEAR,
  ICONS,
  LANGUAGES,
  MIN_GAP_DAYS,
  pickIcon,
  reaches,
  REGION_ORDER,
  REGIONS,
  windows,
  ymd,
  type DayRange,
  type SeasonalIcon,
  type SeasonalOverride
} from "@/features/seasonal-logo/seasonal";

// A port of vision-mobile's SeasonalIconTest (issue ecency/vision-mobile#3656): the web logo
// follows the same days and the same rule as the app icon.

const day = (iso: string) => iso;
const range = (start: string, end: string): DayRange => ({ start, end });
const icon = (date: string, region: string | null, language: string | null, overrides: SeasonalOverride[] = []) =>
  pickIcon(date, region, language, overrides);
function assertDays(
  region: string | null,
  language: string | null,
  expected: Record<string, SeasonalIcon>,
  overrides: SeasonalOverride[] = []
) {
  for (const [date, want] of Object.entries(expected)) {
    expect(icon(date, region, language, overrides), `${date} on a ${language}-${region} browser`).toBe(want);
  }
}

describe("seasonal logo rule", () => {
  it("shows global celebrations for everyone", () =>
    assertDays("DE", "de", {
      "2026-12-31": "NewYear", "2027-01-02": "NewYear", "2027-01-03": "Default",
      "2027-02-13": "Valentines", "2027-02-14": "Valentines", "2027-02-15": "Default",
      "2027-03-20": "HiveDay", "2027-03-21": "Default",
      "2027-04-22": "EarthDay", "2027-05-22": "PizzaDay",
      "2027-09-13": "ProgrammersDay", "2028-09-12": "ProgrammersDay", "2028-09-13": "Default",
      "2027-07-01": "Football", "2028-07-20": "SummerGames", "2027-06-01": "Default",
      "2026-12-24": "Christmas", "2027-10-31": "Default"
    }));

  it("follows the region and the language for regional celebrations", () => {
    expect(icon("2027-10-31", "US", "en")).toBe("Halloween");
    expect(icon("2027-10-29", "IN", "hi")).toBe("Diwali");
    expect(icon("2027-10-29", "US", "hi")).toBe("Diwali");
    expect(icon("2027-10-27", "US", "en")).toBe("Default");
    expect(icon("2027-09-15", "TW", "zh")).toBe("MidAutumn");
    expect(icon("2027-02-20", null, "in")).toBe("RamadanEid");
    expect(icon("2027-02-20", "ID", "id")).toBe("RamadanEid");
    expect(icon("2027-02-20", null, null)).toBe("Default");
  });

  it("settles February 2027: Lunar New Year, Ramadan and Valentine's Day", () => {
    assertDays("CN", "zh", { "2027-02-05": "LunarNewYear", "2027-02-14": "LunarNewYear", "2027-02-20": "LunarNewYear", "2027-02-21": "Default" });
    assertDays("MY", "ms", {
      "2027-02-05": "Default", "2027-02-06": "Default", "2027-02-07": "RamadanEid", "2027-02-14": "RamadanEid",
      "2027-03-12": "RamadanEid", "2027-03-13": "Default"
    });
    assertDays("SG", "ms", {
      "2027-02-06": "LunarNewYear", "2027-02-14": "LunarNewYear", "2027-02-20": "LunarNewYear",
      "2027-02-21": "Default", "2027-02-23": "Default", "2027-02-24": "RamadanEid", "2027-03-09": "RamadanEid",
      "2027-03-12": "RamadanEid", "2027-03-13": "Default"
    });
    expect(icon("2027-03-01", "SG", "en")).toBe("Default");
    assertDays("US", "en", { "2027-02-06": "Default", "2027-02-14": "Valentines" });
  });

  it("settles 20 to 23 March 2027: Hive Day, Nowruz and Holi", () => {
    assertDays("DE", "de", { "2027-03-20": "HiveDay", "2027-03-21": "Default", "2027-03-22": "Default" });
    assertDays("IN", "hi", { "2027-03-20": "Default", "2027-03-21": "Holi", "2027-03-22": "Holi", "2027-03-23": "Default" });
    for (const [region, language] of [["UZ", "uz"], ["KZ", "kk"], ["IR", "fa"], ["AZ", "az"], ["AF", "ps"], ["TJ", "tg"], ["KG", "ky"], ["TM", "tk"]]) {
      assertDays(region, language, { "2027-03-19": "Default", "2027-03-20": "Nowruz", "2027-03-23": "Nowruz", "2027-03-24": "Default" });
    }
    expect(icon("2027-03-21", "DE", "fa")).toBe("Nowruz");
  });

  it("puts Nowruz first in Iran, and Eid keeps its later third day", () => {
    expect(icon("2026-03-21", "IR", "fa")).toBe("Nowruz");
    expect(icon("2026-03-01", "IR", "fa")).toBe("RamadanEid");
    expect(icon("2026-03-16", "IR", "fa")).toBe("RamadanEid");
    expect(icon("2026-03-17", "IR", "fa")).toBe("Default");
    expect(icon("2026-03-21", "AF", "fa")).toBe("Nowruz");
    expect(icon("2026-03-21", "UZ", "uz")).toBe("RamadanEid");
    expect(icon("2027-03-12", "MY", "ms")).toBe("RamadanEid");
  });

  it("shows only one of two celebrations less than three days apart", () => {
    assertDays("CN", "zh", { "2027-09-13": "Default", "2027-09-14": "MidAutumn" });
    const earthLate: SeasonalOverride[] = [{ icon: "EarthDay", year: 2027, range: range(day("2027-05-20"), day("2027-05-20")) }];
    assertDays("DE", "de", { "2027-05-20": "EarthDay", "2027-05-22": "Default" }, earthLate);
    const apart: SeasonalOverride[] = [{ icon: "Christmas", year: 2026, range: range("2026-12-20", "2026-12-27") }];
    assertDays("DE", "de", { "2026-12-27": "Christmas", "2026-12-31": "NewYear" }, apart);
    const tooClose: SeasonalOverride[] = [{ icon: "Christmas", year: 2026, range: range("2026-12-20", "2026-12-28") }];
    assertDays("DE", "de", { "2026-12-24": "Christmas", "2026-12-31": "Default", "2027-01-01": "NewYear" }, tooClose);
  });

  it("shows Black Friday from the day after the US Thanksgiving to the Sunday", () => {
    assertDays("US", "en", {
      "2026-11-26": "Default", "2026-11-27": "BlackFriday", "2026-11-29": "BlackFriday", "2026-11-30": "Default",
      "2027-11-26": "BlackFriday", "2028-11-24": "BlackFriday", "2029-11-23": "BlackFriday", "2029-11-22": "Default"
    });
    expect(icon("2026-11-27", "JP", "ja")).toBe("Default");
  });

  it("covers every lunar and lunisolar celebration from 2026 to 2029, and nothing lunar past it", () => {
    expect(FIRST_YEAR).toBe(2026);
    expect(LAST_YEAR).toBeGreaterThanOrEqual(2029);
    for (let year = 2026; year <= LAST_YEAR; year++) {
      const w = windows(year);
      for (const i of ["LunarNewYear", "RamadanEid", "Holi", "MidAutumn", "Diwali"] as SeasonalIcon[]) {
        const found = w.find((x) => x.icon === i);
        expect(found, `${i} in ${year}`).toBeDefined();
        expect(found!.range.start <= found!.range.end).toBe(true);
      }
      for (const i of ICONS.filter((x) => !["Default", "BlackFriday", "Football", "SummerGames"].includes(x))) {
        expect(w.some((x) => x.icon === i), `${i} in ${year}`).toBe(true);
      }
    }
    expect(windows(2027).find((x) => x.icon === "RamadanEid")!.range).toEqual(range("2027-02-07", "2027-03-12"));
    expect(windows(2027).find((x) => x.icon === "LunarNewYear")!.range).toEqual(range("2027-02-05", "2027-02-20"));
    expect(windows(2026).find((x) => x.icon === "Diwali")!.range).toEqual(range("2026-11-06", "2026-11-10"));
    expect(windows(2028).find((x) => x.icon === "Holi")!.range).toEqual(range("2028-03-10", "2028-03-11"));
    expect(windows(2029).find((x) => x.icon === "MidAutumn")!.range).toEqual(range("2029-09-21", "2029-09-23"));
    expect(windows(LAST_YEAR + 1).some((x) => x.icon === "RamadanEid")).toBe(false);
  });
});

// Pins on the tables themselves, checked against the mobile app's SeasonalIcons.kt
// when they were written: a date or a code dropped or moved here fails, and
// the snapshot is updated only together with the mobile table.
describe("seasonal tables", () => {
  it("has every celebration's days for 2026 to 2029", () => {
    const table = Object.fromEntries(
      [2026, 2027, 2028, 2029].map((y) => [y, windows(y).map((w) => `${w.icon} ${w.range.start}..${w.range.end}`)])
    );
    expect(table).toMatchSnapshot();
  });

  it("reaches each region and language listed for a regional celebration", () => {
    const regional = ICONS.filter((i) => i !== "Default" && !reaches(i, null, null));
    const regions = [...new Set(Object.values(REGIONS).flatMap((s) => [...s!]))].sort();
    const languages = [...new Set(Object.values(LANGUAGES).flatMap((s) => [...s!]))].sort();
    const matrix = {
      regions: Object.fromEntries(regions.map((r) => [r, regional.filter((i) => reaches(i, r, null)).join(" ")])),
      languages: Object.fromEntries(languages.map((l) => [l, regional.filter((i) => reaches(i, null, l)).join(" ")]))
    };
    expect(matrix).toMatchSnapshot();
  });

  it("keeps each region's own order", () => {
    // The pick can only change on a day where a window starts or ends, or where the gap kept
    // around a window that took precedence starts or ends (see `without`). Asking only on those
    // days gives the same runs as a walk over every day of 2026 to 2029, about 30x faster (#2201).
    const shift = (day: string, n: number) => {
      const t = new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000);
      return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    };
    const first = ymd(2026, 1, 1);
    const last = ymd(2029, 12, 31);
    const changes = new Set<string>([first]);
    for (let y = 2025; y <= 2030; y++) {
      // pickIcon reads the windows of the day's year and the two next to it, so the set it
      // picks from changes on each 1 January
      if (y > 2026 && y < 2030) changes.add(ymd(y, 1, 1));
      for (const { range } of windows(y)) {
        for (const day of [
          range.start,
          shift(range.end, 1),
          shift(range.start, -MIN_GAP_DAYS),
          shift(range.end, MIN_GAP_DAYS + 1)
        ]) {
          if (day >= first && day <= last) changes.add(day);
        }
      }
    }
    const days = [...changes].sort();
    const runs = (region: string) => {
      const out: string[] = [];
      for (const day of days) {
        const icon = pickIcon(day, region, null);
        const prev = out[out.length - 1];
        if (!prev || !prev.startsWith(icon + " ")) out.push(`${icon} ${day}`);
      }
      return out.filter((r) => !r.startsWith("Default"));
    };
    expect(Object.fromEntries(Object.keys(REGION_ORDER).map((r) => [r, runs(r)]))).toMatchSnapshot();
  });
});
