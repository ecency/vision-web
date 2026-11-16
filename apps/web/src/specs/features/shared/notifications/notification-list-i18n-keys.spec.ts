import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// The notifications list's signed-out message used `notifications.auth-required-desc`,
// a key that only existed under `decks.`, so a signed-out list showed the raw key.
describe("notification list i18n keys", () => {
  it("every notifications.* key the list uses exists in en-US", () => {
    const src = readFileSync(resolve(__dirname, "../../../../features/shared/notifications/notification-list.tsx"), "utf8");
    const en = JSON.parse(readFileSync(resolve(__dirname, "../../../../features/i18n/locales/en-US.json"), "utf8"));
    const keys = [...new Set(Array.from(src.matchAll(/i18next\.t\("notifications\.([a-z0-9-]+)"/g), (m) => m[1]))];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => typeof en.notifications?.[key] !== "string")).toEqual([]);
  });
});
