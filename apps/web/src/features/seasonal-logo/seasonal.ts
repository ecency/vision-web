// Which celebration skin the navbar logo wears on a day: the same days and the
// same rule as the mobile app icon (vision-mobile shared/.../app/SeasonalIcons.kt,
// issue ecency/vision-mobile#3656). Keep the two in step: a date added or moved
// there is added or moved here.
//
// Days are calendar days ("YYYY-MM-DD") in the reader's own time zone; as
// strings they compare in date order.

export const ICONS = [
  "Default",
  "NewYear",
  "LunarNewYear",
  "Valentines",
  "RamadanEid",
  "HiveDay",
  "Nowruz",
  "Holi",
  "EarthDay",
  "PizzaDay",
  "Football",
  "SummerGames",
  "ProgrammersDay",
  "MidAutumn",
  "Diwali",
  "Halloween",
  "BlackFriday",
  "Christmas"
] as const;
export type SeasonalIcon = (typeof ICONS)[number];

/// Shown only where they are widely kept (see AUDIENCES); the rest show for everyone.
const REGIONAL = new Set<SeasonalIcon>([
  "LunarNewYear",
  "RamadanEid",
  "Nowruz",
  "Holi",
  "MidAutumn",
  "Diwali",
  "Halloween",
  "BlackFriday",
  "Christmas"
]);

export interface DayRange {
  start: string;
  end: string;
}
export interface SeasonalWindow {
  icon: SeasonalIcon;
  year: number;
  range: DayRange;
}
/// Other days for a celebration, for the rule's tests only.
export interface SeasonalOverride {
  icon: SeasonalIcon;
  year: number | null;
  range: DayRange | null;
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const epoch = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;
const plus = (day: string, n: number) => {
  const t = new Date((epoch(day) + n) * DAY_MS);
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

export const FIRST_YEAR = 2026;
export const LAST_YEAR = 2029;

/// The Friday after the fourth Thursday of November.
function blackFriday(year: number) {
  const nov1 = ymd(year, 11, 1);
  const dow = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0 Sunday .. 4 Thursday
  const firstThursday = plus(nov1, (4 - dow + 7) % 7);
  return plus(firstThursday, 22);
}

// Published dates (sources in SeasonalIcons.kt). Past LAST_YEAR a lunar
// celebration does not show rather than on a wrong day: extend before then.
const LUNAR_NEW_YEAR: Record<number, string> = { 2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26", 2029: "2029-02-13" };
const MID_AUTUMN: Record<number, string> = { 2026: "2026-09-25", 2027: "2027-09-15", 2028: "2028-10-03", 2029: "2029-09-22" };
/// 1 Ramadan and 1 Shawwal (Eid al-Fitr), Umm al-Qura.
const RAMADAN: Record<number, [string, string]> = {
  2026: ["2026-02-18", "2026-03-20"],
  2027: ["2027-02-08", "2027-03-09"],
  2028: ["2028-01-28", "2028-02-26"],
  2029: ["2029-01-16", "2029-02-14"]
};
const HOLI: Record<number, string> = { 2026: "2026-03-04", 2027: "2027-03-22", 2028: "2028-03-11", 2029: "2029-03-01" };
const DIWALI: Record<number, string> = { 2026: "2026-11-08", 2027: "2027-10-29", 2028: "2028-10-17", 2029: "2029-11-05" };
const FOOTBALL: Record<number, DayRange> = {
  2026: { start: "2026-06-11", end: "2026-07-19" },
  2027: { start: "2027-06-24", end: "2027-07-25" },
  2028: { start: "2028-06-09", end: "2028-07-09" }
};
const SUMMER_GAMES: Record<number, DayRange> = { 2028: { start: "2028-07-14", end: "2028-07-30" } };

/// Every celebration of `year` with its days. New Year of `year` starts on 31 Dec of the year before.
export function windows(year: number): SeasonalWindow[] {
  const out: SeasonalWindow[] = [];
  const add = (icon: SeasonalIcon, start: string, end = start) => out.push({ icon, year, range: { start, end } });
  add("NewYear", ymd(year - 1, 12, 31), ymd(year, 1, 2));
  if (LUNAR_NEW_YEAR[year]) add("LunarNewYear", plus(LUNAR_NEW_YEAR[year], -1), plus(LUNAR_NEW_YEAR[year], 14));
  add("Valentines", ymd(year, 2, 13), ymd(year, 2, 14));
  if (RAMADAN[year]) add("RamadanEid", plus(RAMADAN[year][0], -1), plus(RAMADAN[year][1], 3));
  add("HiveDay", ymd(year, 3, 20));
  add("Nowruz", ymd(year, 3, 20), ymd(year, 3, 23));
  if (HOLI[year]) add("Holi", plus(HOLI[year], -1), HOLI[year]);
  add("EarthDay", ymd(year, 4, 22));
  add("PizzaDay", ymd(year, 5, 22));
  if (FOOTBALL[year]) add("Football", FOOTBALL[year].start, FOOTBALL[year].end);
  if (SUMMER_GAMES[year]) add("SummerGames", SUMMER_GAMES[year].start, SUMMER_GAMES[year].end);
  // the 256th day of the year
  add("ProgrammersDay", plus(ymd(year, 1, 1), 255));
  if (MID_AUTUMN[year]) add("MidAutumn", plus(MID_AUTUMN[year], -1), plus(MID_AUTUMN[year], 1));
  if (DIWALI[year]) add("Diwali", plus(DIWALI[year], -2), plus(DIWALI[year], 2));
  add("Halloween", ymd(year, 10, 29), ymd(year, 10, 31));
  const bf = blackFriday(year);
  add("BlackFriday", bf, plus(bf, 2));
  add("Christmas", ymd(year, 12, 20), ymd(year, 12, 26));
  return out;
}

const codes = (s: string) => new Set(s.split(" ").filter(Boolean));
export const REGIONS: Partial<Record<SeasonalIcon, Set<string>>> = {
  LunarNewYear: codes("CN TW HK MO SG MY VN KR"),
  MidAutumn: codes("CN TW HK MO SG MY VN"),
  RamadanEid: codes(
    "SA AE QA KW BH OM YE JO IQ SY PS EG LY TN DZ MA MR SD SO DJ KM TR AZ IR AF PK BD MV MY ID BN UZ KZ KG TJ TM " +
      "SN ML NE GN GM BF TD XK AL"
  ),
  Nowruz: codes("IR AF AZ UZ KZ KG TJ TM AL XK"),
  Holi: codes("IN NP"),
  Diwali: codes("IN NP LK SG MY MU FJ"),
  Halloween: codes("US CA GB IE AU NZ"),
  BlackFriday: codes("US CA GB IE AU NZ BR MX DE FR ES IT NL PL"),
  // where Christmas on 25 Dec is widely kept (Orthodox 7 Jan countries left out)
  Christmas: codes(
    "US CA MX GT HN SV NI CR PA CU DO HT JM PR TT BS BB BZ GY SR CO VE EC PE BO PY CL AR UY BR " +
      "GB IE FR DE NL BE LU CH AT IT ES PT MT AD MC SM VA LI DK NO SE FI IS EE LV LT PL CZ SK HU SI HR BA RO BG GR CY UA MD " +
      "AU NZ PG FJ WS TO PH TL ZA NA BW ZM ZW MW AO CD CG CM RW BI UG KE TZ GH LS SZ MG"
  )
};
export const LANGUAGES: Partial<Record<SeasonalIcon, Set<string>>> = {
  LunarNewYear: codes("zh vi ko"),
  MidAutumn: codes("zh vi"),
  RamadanEid: codes("ar ms id tr ur"),
  Nowruz: codes("fa tg uz kk ky tk az ku ckb"),
  Holi: codes("hi ne"),
  Diwali: codes("hi ne ta gu mr te kn")
};
const DEFAULT_ORDER: SeasonalIcon[] = [
  "RamadanEid",
  "Diwali",
  "Holi",
  "Nowruz",
  "LunarNewYear",
  "MidAutumn",
  "Christmas",
  "Halloween",
  "BlackFriday"
];
/// Singapore keeps Lunar New Year first; in Iran, Afghanistan and Tajikistan Nowruz wins.
export const REGION_ORDER: Record<string, SeasonalIcon[]> = {
  SG: ["LunarNewYear", "MidAutumn"],
  IR: ["Nowruz"],
  AF: ["Nowruz"],
  TJ: ["Nowruz"]
};
const LEGACY_LANGUAGES: Record<string, string> = { in: "id", iw: "he", ji: "yi" };

export function normLanguage(code: string | null | undefined): string | null {
  const l = code?.split(/[-_]/)[0]?.toLowerCase();
  if (!l) return null;
  return LEGACY_LANGUAGES[l] ?? l;
}
export function normRegion(code: string | null | undefined): string | null {
  const r = code?.toUpperCase();
  return r && /^[A-Z]{2}$/.test(r) ? r : null;
}

export function reaches(icon: SeasonalIcon, region: string | null, language: string | null) {
  if (icon === "Default") return false;
  if (!REGIONAL.has(icon)) return true;
  const r = normRegion(region);
  const l = normLanguage(language);
  return (!!r && !!REGIONS[icon]?.has(r)) || (!!l && !!LANGUAGES[icon]?.has(l));
}

function order(region: string | null): SeasonalIcon[] {
  const first = REGION_ORDER[normRegion(region) ?? ""] ?? [];
  return [...first, ...DEFAULT_ORDER.filter((i) => !first.includes(i))];
}

/// A browser never switches skin twice within a few days.
export const MIN_GAP_DAYS = 3;

/// The days of `range` at least MIN_GAP_DAYS plain days away from `taken`: none, one or two parts.
function without(range: DayRange, taken: DayRange): DayRange[] {
  const blockedFrom = plus(taken.start, -MIN_GAP_DAYS);
  const blockedTo = plus(taken.end, MIN_GAP_DAYS);
  if (range.end < blockedFrom || range.start > blockedTo) return [range];
  const parts: DayRange[] = [];
  const before = { start: range.start, end: plus(blockedFrom, -1) };
  const after = { start: plus(blockedTo, 1), end: range.end };
  if (before.start <= before.end) parts.push(before);
  if (after.start <= after.end) parts.push(after);
  return parts;
}

function withOverrides(year: number, table: SeasonalWindow[], overrides: SeasonalOverride[]): SeasonalWindow[] {
  const mine = overrides.filter((o) => o.year === null || o.year === year);
  if (!mine.length) return table;
  // a year's own override beats an every-year one
  const byIcon = new Map<SeasonalIcon, SeasonalOverride>();
  for (const o of [...mine].sort((a, b) => (a.year === null ? 0 : 1) - (b.year === null ? 0 : 1))) byIcon.set(o.icon, o);
  return [
    ...table.filter((w) => !byIcon.has(w.icon)),
    ...[...byIcon.values()].flatMap((o) => (o.range ? [{ icon: o.icon, year, range: o.range }] : []))
  ];
}

/// The skin for `day` (YYYY-MM-DD) in a browser set to `region` and `language`.
/// Regional celebrations go before global ones, regional ones in their region's
/// order, then the earlier; each keeps only its days at least MIN_GAP_DAYS
/// plain days from every one kept before it.
export function pickIcon(
  day: string,
  region: string | null,
  language: string | null,
  overrides: SeasonalOverride[] = []
): SeasonalIcon {
  const year = Number(day.slice(0, 4));
  const ord = order(region);
  const rank = (w: SeasonalWindow) => [
    REGIONAL.has(w.icon) ? 0 : 1,
    ord.indexOf(w.icon),
    epoch(w.range.start),
    ICONS.indexOf(w.icon)
  ];
  const candidates = [year - 1, year, year + 1]
    .flatMap((y) => withOverrides(y, windows(y), overrides))
    .filter((w) => reaches(w.icon, region, language) && w.range.start <= w.range.end)
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
      return 0;
    });
  const kept: SeasonalWindow[] = [];
  for (const w of candidates) {
    let parts = [w.range];
    for (const k of kept) parts = parts.flatMap((p) => without(p, k.range));
    for (const p of parts) kept.push({ ...w, range: p });
  }
  return kept.find((w) => day >= w.range.start && day <= w.range.end)?.icon ?? "Default";
}
