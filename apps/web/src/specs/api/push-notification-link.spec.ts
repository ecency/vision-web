import { describe, expect, it } from "vitest";
import { buildPushNotificationUrl } from "@/api/push-notification-link";
import { PUSH_LINK_CASES } from "./push-notification-link-cases";

/**
 * The foreground half of push handling: when the tab is open, FCM delivers the
 * message to the page and `api/firebase.ts` builds the click destination from
 * this. It answers the same cases as the service worker, which handles the same
 * payload when the tab is not open.
 */
describe("buildPushNotificationUrl", () => {
  it.each(PUSH_LINK_CASES.map((c) => [c.name, c.data, c.expected] as const))(
    "%s",
    (_name, data, expected) => {
      expect(buildPushNotificationUrl(data)).toBe(expected);
    }
  );

  it("falls back to the home page with no payload at all", () => {
    expect(buildPushNotificationUrl(undefined)).toBe("https://ecency.com");
  });
});
