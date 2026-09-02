import { describe, expect, it } from "vitest";
import { NewsletterApiError } from "@ecency/sdk";
import { subscribeErrorMessage } from "@/features/newsletter/digest-subscribe-dialog";
import catalog from "@/features/i18n/locales/en-US.json";

// i18next is globally mocked to return keys. The mapping is by relay status,
// which every failure carries; 422 is the service's tag offer gate and must not
// read as a generic failure, since the reader can do nothing about it but wait.
describe("subscribeErrorMessage", () => {
  it("names the tag offer gate, keeps the other statuses, and falls back for the rest", () => {
    expect(subscribeErrorMessage(new NewsletterApiError("quiet", 422))).toBe(
      "newsletter.error-tag-quiet"
    );
    expect(subscribeErrorMessage(new NewsletterApiError("down", 503))).toBe(
      "newsletter.error-unavailable"
    );
    expect(subscribeErrorMessage(new NewsletterApiError("gw", 502))).toBe(
      "newsletter.error-gateway"
    );
    expect(subscribeErrorMessage(new NewsletterApiError("gw", 504))).toBe(
      "newsletter.error-gateway"
    );
    expect(subscribeErrorMessage(new NewsletterApiError("bot", 403))).toBe(
      "newsletter.error-captcha"
    );
    expect(subscribeErrorMessage(new NewsletterApiError("slow", 429))).toBe(
      "newsletter.error-too-many"
    );
    expect(subscribeErrorMessage(new NewsletterApiError("bad", 400))).toBe(
      "newsletter.error-generic"
    );
    expect(subscribeErrorMessage(new Error("network"))).toBe("newsletter.error-generic");
  });

  // i18next is mocked here, so a key that resolves to itself still passes the
  // mapping test above; this pins that each of those keys is a real string in
  // the shipped catalog (a key filed under the wrong namespace read as a raw
  // "newsletter.error-tag-quiet" in the toast).
  it("only returns keys the English catalog defines", () => {
    const statuses = [422, 503, 502, 504, 403, 429, 400];
    const keys = new Set(
      statuses.map((status) => subscribeErrorMessage(new NewsletterApiError("x", status)))
    );
    for (const key of keys) {
      const [ns, name] = key.split(".");
      const value = (catalog as Record<string, Record<string, unknown>>)[ns]?.[name];
      expect(typeof value, key).toBe("string");
    }
  });
});
