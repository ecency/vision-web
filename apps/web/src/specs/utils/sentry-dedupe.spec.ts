import { describe, expect, it } from "vitest";
import { dedupeIntegration } from "@sentry/core";
import type { Event, Integration } from "@sentry/core";
import { clientIntegrations } from "@/utils/sentry-dedupe";

const rc = (user: string, op = "post"): Event => ({
  message: `rc-shortfall: rejected/${op}`,
  fingerprint: ["rc-shortfall"],
  level: "info",
  tags: { "rc.stage": "rejected", "rc.op": op },
  user: { username: user }
});
const crash = (): Event => ({ message: "TypeError: x is undefined" });

function dedupeOf(list: Integration[]): Integration {
  const d = list.find((i) => i.name === "Dedupe");
  if (!d) throw new Error("Dedupe missing");
  return d;
}

/** Messages of the events the configured Dedupe lets through, in order. */
function kept(events: Event[]): string[] {
  const dedupe = dedupeOf(clientIntegrations([dedupeIntegration()]));
  return events
    .map((e) => dedupe.processEvent!(e, {}, {} as never) as Event | null)
    .filter((e): e is Event => !!e)
    .map((e) => `${e.message}${e.user ? ` @${e.user.username}` : ""}`);
}

// #2196: Sentry's default Dedupe drops an event equal to the previous one by
// message, fingerprint and stacktrace, ignoring user and tags. For RC telemetry
// that silently drops the next account's identical failure.
describe("client Sentry integrations: RC telemetry is exempt from Dedupe", () => {
  it("keeps consecutive identical RC rejections from different users", () => {
    expect(kept([rc("alice"), rc("bob")])).toEqual([
      "rc-shortfall: rejected/post @alice",
      "rc-shortfall: rejected/post @bob"
    ]);
  });

  it("keeps consecutive identical RC rejections from the same user", () => {
    expect(kept([rc("alice"), rc("alice")])).toHaveLength(2);
  });

  it("still drops a repeated ordinary error", () => {
    expect(kept([crash(), crash()])).toEqual(["TypeError: x is undefined"]);
  });

  it("an RC event in between does not reset Dedupe for ordinary errors", () => {
    expect(kept([crash(), rc("alice"), crash()])).toEqual([
      "TypeError: x is undefined",
      "rc-shortfall: rejected/post @alice"
    ]);
  });

  it("keeps the other default integrations and still removes BrowserTracing", () => {
    const names = clientIntegrations([
      { name: "BrowserTracing" },
      dedupeIntegration(),
      { name: "Breadcrumbs" }
    ] as Integration[]).map((i) => i.name);
    expect(names).toEqual(["Dedupe", "Breadcrumbs"]);
  });
});
