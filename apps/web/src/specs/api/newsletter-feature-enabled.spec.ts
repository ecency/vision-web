import { afterEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ newsletter: true }));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (fn: (c: unknown) => unknown) => fn({ visionFeatures: { newsletter: { enabled: flags.newsletter } } })
  }
}));

/** The server-side answer the client provider and server components are fed from. */
describe("newsletterFeatureEnabled", () => {
  const saved = { url: process.env.NEWSLETTER_API_URL, token: process.env.NEWSLETTER_SERVICE_TOKEN };
  afterEach(() => {
    process.env.NEWSLETTER_API_URL = saved.url;
    process.env.NEWSLETTER_SERVICE_TOKEN = saved.token;
    flags.newsletter = true;
    vi.resetModules();
  });

  async function load() {
    vi.resetModules();
    return import("@/server/newsletter-internal");
  }

  it("is on only when both service settings are present", async () => {
    process.env.NEWSLETTER_API_URL = "http://news.internal:3300";
    process.env.NEWSLETTER_SERVICE_TOKEN = "t".repeat(32);
    expect((await load()).newsletterFeatureEnabled()).toBe(true);

    process.env.NEWSLETTER_SERVICE_TOKEN = "";
    expect((await load()).newsletterFeatureEnabled()).toBe(false);

    process.env.NEWSLETTER_SERVICE_TOKEN = "t".repeat(32);
    delete process.env.NEWSLETTER_API_URL;
    expect((await load()).newsletterFeatureEnabled()).toBe(false);
  });

  it("is off when the kill switch is off, even though the relay stays configured", async () => {
    process.env.NEWSLETTER_API_URL = "http://news.internal:3300";
    process.env.NEWSLETTER_SERVICE_TOKEN = "t".repeat(32);
    flags.newsletter = false;
    const mod = await load();
    expect(mod.newsletterFeatureEnabled()).toBe(false);
    expect(mod.newsletterConfigured()).toBe(true);
  });
});
