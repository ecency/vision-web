import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import i18next, { type TFunction } from "i18next";
import english from "@/features/i18n/locales/en-US.json";
import ukrainian from "@/features/i18n/locales/uk-UA.json";
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

let translations: Awaited<ReturnType<typeof makeTranslations>>;
let restore: () => void;

async function makeTranslations() {
  const { createInstance } = await vi.importActual<typeof import("i18next")>("i18next");
  const instance = createInstance();
  await instance.init({
    lng: "en-US",
    fallbackLng: "en-US",
    interpolation: { escapeValue: false },
    resources: {
      "en-US": { translation: english },
      "uk-UA": { translation: ukrainian }
    }
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

  it.each(["checkins", "checkin", "monthly-posts", "monthly_posts"])(
    "%s in uk-UA with count 7 carries no English suffix",
    async (type) => {
      await inLanguage("uk-UA", () => {
        const body = getBody({ type, source: "alice", extra: { count: 7 } });
        expect(body).toContain("7");
        // Neither the old hand-built "s" glued to a word, nor an unfilled placeholder.
        expect(body).not.toMatch(/[^\sA-Za-z]s\b/);
        expect(body).not.toContain("{{");
      });
    }
  );

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
