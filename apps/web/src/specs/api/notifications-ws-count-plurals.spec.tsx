import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import i18next, { type TFunction } from "i18next";
import english from "@/features/i18n/locales/en-US.json";
import { NotificationsWebSocket } from "@/api/notifications-ws-api";
import { NotificationCheckinsType } from "@/features/shared/notifications/notification-types/notification-checkins-type";
import { NotificationMonthlyPostsType } from "@/features/shared/notifications/notification-types/notification-monthly-posts-type";

/**
 * #2021: the check-in and monthly-posts strings built their plural by hand,
 * passing an English "s" as {{suffix}} into every locale ("7 дн.s"). They now
 * use i18next plurals, so the count picks the form and no locale gets an "s".
 */
type GetBody = (data: { type: string; source: string; extra: Record<string, unknown> }) => string;
const getBody = (NotificationsWebSocket as unknown as { getBody: GetBody }).getBody;

const localesDir = path.resolve(__dirname, "../../features/i18n/locales");
const locales = readdirSync(localesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

let translations: Awaited<ReturnType<typeof makeTranslations>>;
let restore: () => void;

async function makeTranslations() {
  const { createInstance } = await vi.importActual<typeof import("i18next")>("i18next");
  const instance = createInstance();
  await instance.init({
    lng: "en-US",
    fallbackLng: "en-US",
    interpolation: { escapeValue: false },
    resources: Object.fromEntries(
      locales.map((locale) => [
        locale,
        { translation: JSON.parse(readFileSync(path.join(localesDir, `${locale}.json`), "utf8")) }
      ])
    )
  });
  return instance;
}

beforeAll(async () => {
  translations = await makeTranslations();
  const spy = vi
    .spyOn(i18next, "t")
    .mockImplementation(((...args: Parameters<TFunction>) => translations.t(...args)) as never);
  restore = () => spy.mockRestore();
});

afterAll(() => restore());

const inLanguage = async (lng: string, run: () => void) => {
  await translations.changeLanguage(lng);
  try {
    run();
  } finally {
    await translations.changeLanguage("en-US");
  }
};

describe("count notifications use i18next plurals (#2021)", () => {
  it.each(["checkins", "checkin"])("%s reads 1 day / 7 days in en-US", async (type) => {
    await inLanguage("en-US", () => {
      expect(getBody({ type, source: "alice", extra: { count: 1 } })).toBe(
        "You checked in 1 day this week. Keep it up!"
      );
      expect(getBody({ type, source: "alice", extra: { count: 7 } })).toBe(
        "You checked in 7 days this week. Keep it up!"
      );
    });
  });

  it.each(["monthly-posts", "monthly_posts"])("%s reads 1 post / 7 posts in en-US", async (type) => {
    await inLanguage("en-US", () => {
      expect(getBody({ type, source: "alice", extra: { count: 1 } })).toBe(
        "You created 1 post this month. Keep it up!"
      );
      expect(getBody({ type, source: "alice", extra: { count: 7 } })).toBe(
        "You created 7 posts this month. Keep it up!"
      );
    });
  });

  it("en-US carries the _one and _other forms and no bare key", () => {
    const strings = english.notification as Record<string, string | undefined>;
    for (const key of ["checkins", "monthly-posts"]) {
      expect(strings[key], key).toBeUndefined();
      expect(strings[`${key}_one`], key).toContain("{{count}}");
      expect(strings[`${key}_other`], key).toContain("{{count}}");
    }
  });

  // These checks must survive a Crowdin download, which can replace a locale's
  // strings with the English source and drop _few/_many (i18next then falls
  // back to en-US). So nothing here pins a locale's exact sentence or demands
  // every plural category: only that no locale shows the old hand-built suffix.
  it.each(locales)("%s has no {{suffix}} string", (locale) => {
    expect(readFileSync(path.join(localesDir, `${locale}.json`), "utf8")).not.toContain(
      "{{suffix}}"
    );
  });

  it.each(locales)("%s renders counts 1 and 7 with no stray English suffix", (locale) => {
    const t = translations.getFixedT(locale);
    for (const key of ["checkins", "monthly-posts"]) {
      for (const count of [1, 7]) {
        const body = t(`notification.${key}`, { count });
        expect(body, `${locale} ${key} ${count}`).toContain(String(count));
        // Neither an "s" glued to a non-Latin word ("7 дн.s"), nor a placeholder.
        expect(body, `${locale} ${key} ${count}`).not.toMatch(/[^\s\p{Script=Latin}]s\b/u);
        expect(body, `${locale} ${key} ${count}`).not.toContain("{{");
      }
    }
  });

  // Where the counted noun inflects, 1 and 7 must not read the same (the seed
  // once copied "7 Tag", "7 día", "7 jour" into every category). An English
  // fallback after a sync still passes, since "day" and "days" differ.
  // Listed pairs use the same noun for 1 and 7 in correct grammar.
  const invariant = new Set([
    "hi-IN checkins",
    "it-IT monthly-posts",
    "tr-TR checkins",
    "tr-TR monthly-posts",
    "uz-UZ checkins",
    "uz-UZ monthly-posts"
  ]);
  it.each(locales)("%s inflects the counted noun between 1 and 7", (locale) => {
    const rules = new Intl.PluralRules(locale);
    if (rules.select(1) === rules.select(7)) return;
    const t = translations.getFixedT(locale);
    for (const key of ["checkins", "monthly-posts"]) {
      if (invariant.has(`${locale} ${key}`)) continue;
      const one = t(`notification.${key}`, { count: 1 }).replace("1", "N");
      const seven = t(`notification.${key}`, { count: 7 }).replace("7", "N");
      expect(seven, `${locale} ${key}`).not.toBe(one);
    }
  });

  it("the check-ins list item renders the plural form", () => {
    render(
      <NotificationCheckinsType
        sourceLink={<span />}
        notification={{ type: "checkins", source: "alice", count: 7 } as never}
      />
    );
    expect(screen.getByText("You checked in 7 days this week. Keep it up!")).toBeInTheDocument();
  });

  it("the monthly-posts list item renders the singular form", () => {
    render(
      <NotificationMonthlyPostsType
        sourceLink={<span />}
        notification={{ type: "monthly-posts", source: "alice", count: 1 } as never}
      />
    );
    expect(screen.getByText("You created 1 post this month. Keep it up!")).toBeInTheDocument();
  });
});
