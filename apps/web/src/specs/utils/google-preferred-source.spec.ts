import { describe, expect, it } from "vitest";
import { getGooglePreferredSourceUrl } from "@/utils/google-preferred-source";

// Google Preferred Sources only accepts a root domain or subdomain, and the
// same codebase runs on other hosts, so the link is gated to the ecency.com
// site base and never promotes ecency.com from somewhere else (#1495).
describe("getGooglePreferredSourceUrl", () => {
  it.each(["https://ecency.com", "https://ecency.com/", "https://www.ecency.com", "HTTPS://ECENCY.COM"])(
    "builds the preferred source link for %s",
    (base) => {
      expect(getGooglePreferredSourceUrl(base)).toBe(
        "https://google.com/preferences/source?q=ecency.com"
      );
    }
  );

  it.each([
    "https://alpha.ecency.com",
    "https://blog.example.com",
    "https://notecency.com",
    "https://ecency.com.evil.io",
    "http://localhost:3000",
    "",
    "not a url",
    undefined,
    null
  ])("returns null off the ecency.com host (%s)", (base) => {
    expect(getGooglePreferredSourceUrl(base)).toBeNull();
  });
});
