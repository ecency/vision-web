import { describe, it, expect } from "vitest";
import { beforeSend } from "@/utils/sentry-before-send";
import { scrubBreadcrumb, scrubSentryEvent, scrubUrlSecrets } from "@/utils/sentry-scrub";

type Ev = Parameters<typeof beforeSend>[0];

// Issue #1651: the image upload addresses the imagehoster as /hs/<access token>.
const TOKEN = "eyJzaWduZWRfbWVzc2FnZSI6eyJ0eXBlIjoiY29kZSJ9fQ";
const UPLOAD_URL = `https://i.ecency.com/hs/${TOKEN}`;
// The app's own uploader uses defaults.imageServer, a different host.
const ALT_UPLOAD_URL = `https://images.ecency.com/hs/${TOKEN}`;
const SCRUBBED = "https://i.ecency.com/hs/[Filtered]";

function baseEvent(extra: Partial<Ev> = {}): Ev {
  return {
    exception: { values: [{ type: "TypeError", value: "Failed to fetch" }] },
    ...extra
  } as unknown as Ev;
}

describe("scrubUrlSecrets", () => {
  it("redacts the upload token on any host", () => {
    expect(scrubUrlSecrets(UPLOAD_URL)).toBe(SCRUBBED);
    expect(scrubUrlSecrets(ALT_UPLOAD_URL)).toBe("https://images.ecency.com/hs/[Filtered]");
  });

  it("redacts the whole remaining path, keeping the query boundary", () => {
    expect(scrubUrlSecrets(`${UPLOAD_URL}/tail?x=1`)).toBe(`${SCRUBBED}?x=1`);
  });

  it("redacts newsletter tokens in page and API paths", () => {
    expect(scrubUrlSecrets("https://ecency.com/newsletter/confirm/abc123")).toBe(
      "https://ecency.com/newsletter/confirm/[Filtered]"
    );
    expect(scrubUrlSecrets("/api/newsletter/unsubscribe/abc123/all")).toBe(
      "/api/newsletter/unsubscribe/[Filtered]"
    );
  });

  it("redacts secret query and fragment parameters, keeping the others", () => {
    expect(scrubUrlSecrets("https://ecency.com/auth?code=SECRET&next=/feed")).toBe(
      "https://ecency.com/auth?code=[Filtered]&next=/feed"
    );
    expect(
      scrubUrlSecrets("https://hivesigner.com/api/oauth2/token?code=C1&client_secret=S1")
    ).toBe("https://hivesigner.com/api/oauth2/token?code=[Filtered]&client_secret=[Filtered]");
    expect(scrubUrlSecrets("/api/mattermost/websocket?token=T1")).toBe(
      "/api/mattermost/websocket?token=[Filtered]"
    );
    expect(scrubUrlSecrets("https://ecency.com/cb#access_token=A1&state=s")).toBe(
      "https://ecency.com/cb#access_token=[Filtered]&state=s"
    );
  });

  it("redacts a URL embedded in free text", () => {
    expect(scrubUrlSecrets(`POST "${UPLOAD_URL}" failed`)).toBe(`POST "${SCRUBBED}" failed`);
  });

  it("leaves non-matching URLs untouched", () => {
    const urls = [
      "https://i.ecency.com/u/alice/avatar/small",
      "https://ecency.com/hive-123/@alice/my-post?ref=home",
      "https://api.hive.blog/?tokenizer=1",
      "https://ecency.com/created/hs",
      "https://ecency.com/newsletter"
    ];
    for (const url of urls) {
      expect(scrubUrlSecrets(url)).toBe(url);
    }
  });
});

describe("beforeSend - secret-bearing URLs are redacted in every location (#1651)", () => {
  it("breadcrumb data.url (fetch/xhr)", () => {
    const out = beforeSend(
      baseEvent({
        breadcrumbs: [{ category: "fetch", data: { method: "POST", url: UPLOAD_URL } }]
      })
    );
    expect((out!.breadcrumbs![0].data as { url: string }).url).toBe(SCRUBBED);
    expect((out!.breadcrumbs![0].data as { method: string }).method).toBe("POST");
  });

  it("breadcrumb data.from/to (navigation)", () => {
    const out = beforeSend(
      baseEvent({
        breadcrumbs: [
          { category: "navigation", data: { from: "/auth?code=C1", to: "/newsletter/confirm/N1" } }
        ]
      })
    );
    expect(out!.breadcrumbs![0].data).toEqual({
      from: "/auth?code=[Filtered]",
      to: "/newsletter/confirm/[Filtered]"
    });
  });

  it("breadcrumb message", () => {
    const out = beforeSend(
      baseEvent({ breadcrumbs: [{ category: "console", message: `upload to ${UPLOAD_URL}` }] })
    );
    expect(out!.breadcrumbs![0].message).toBe(`upload to ${SCRUBBED}`);
  });

  it("request.url, request.query_string and the Referer header", () => {
    const out = beforeSend(
      baseEvent({
        request: {
          url: "https://ecency.com/auth?code=C1",
          query_string: "code=C1&x=1",
          headers: { Referer: "https://ecency.com/newsletter/unsubscribe/N1", "User-Agent": "UA" }
        }
      })
    );
    expect(out!.request!.url).toBe("https://ecency.com/auth?code=[Filtered]");
    expect(out!.request!.query_string).toBe("code=[Filtered]&x=1");
    expect(out!.request!.headers).toEqual({
      Referer: "https://ecency.com/newsletter/unsubscribe/[Filtered]",
      "User-Agent": "UA"
    });
  });

  it("request.query_string in object and pair forms", () => {
    const obj = scrubSentryEvent({ request: { query_string: { code: "C1", x: "1" } } });
    expect(obj.request!.query_string).toEqual({ code: "[Filtered]", x: "1" });
    const pairs = scrubSentryEvent({
      request: {
        query_string: [
          ["token", "T1"],
          ["x", "1"]
        ]
      }
    });
    expect(pairs.request!.query_string).toEqual([
      ["token", "[Filtered]"],
      ["x", "1"]
    ]);
  });

  it("exception value (an error message quoting the URL)", () => {
    const out = beforeSend(
      baseEvent({
        exception: { values: [{ type: "Error", value: `Request to ${UPLOAD_URL} failed` }] }
      })
    );
    expect(out!.exception!.values![0].value).toBe(`Request to ${SCRUBBED} failed`);
  });

  it("event message (captureMessage)", () => {
    const out = beforeSend(baseEvent({ message: `upload failed: ${UPLOAD_URL}` }));
    expect(out!.message).toBe(`upload failed: ${SCRUBBED}`);
  });

  it("extra (lazy-sentry early-error replay) and contexts", () => {
    const out = beforeSend(
      baseEvent({
        extra: { earlyMessage: `boom ${UPLOAD_URL}`, earlyPosition: "1:2" },
        contexts: { page: { url: "https://ecency.com/auth?code=C1" } }
      })
    );
    expect(out!.extra).toEqual({ earlyMessage: `boom ${SCRUBBED}`, earlyPosition: "1:2" });
    expect((out!.contexts as Record<string, Record<string, string>>).page.url).toBe(
      "https://ecency.com/auth?code=[Filtered]"
    );
  });

  it("tags", () => {
    const out = beforeSend(baseEvent({ tags: { upload: UPLOAD_URL, source: "client" } }));
    expect(out!.tags).toEqual({ upload: SCRUBBED, source: "client" });
  });

  it("the timeoutUrl tag derived from breadcrumbs never carries the token", () => {
    const out = beforeSend(
      baseEvent({
        exception: { values: [{ type: "TimeoutError", value: "signal timed out" }] },
        breadcrumbs: [{ category: "fetch", data: { url: UPLOAD_URL } }]
      })
    );
    expect(out!.tags!.timeoutUrl).toBe(SCRUBBED);
  });

  it("leaves non-matching URLs untouched everywhere", () => {
    const url = "https://i.ecency.com/u/alice/avatar/small?format=webp";
    const out = beforeSend(
      baseEvent({
        breadcrumbs: [{ category: "fetch", message: url, data: { url } }],
        request: { url }
      })
    );
    expect((out!.breadcrumbs![0].data as { url: string }).url).toBe(url);
    expect(out!.breadcrumbs![0].message).toBe(url);
    expect(out!.request!.url).toBe(url);
  });

  it("never throws: an unscrubbable location is removed, not sent", () => {
    const hostile = {} as Record<string, unknown>;
    Object.defineProperty(hostile, "url", {
      enumerable: true,
      get: () => UPLOAD_URL,
      set: () => {
        throw new Error("frozen");
      }
    });
    const ev = baseEvent({ breadcrumbs: [{ category: "fetch", data: hostile }] });
    let out: Ev | null = null;
    expect(() => {
      out = beforeSend(ev);
    }).not.toThrow();
    expect(out!.breadcrumbs).toBeUndefined();
  });
});

describe("scrubBreadcrumb (beforeBreadcrumb hook)", () => {
  it("redacts the crumb at record time, so feedback events inherit clean crumbs", () => {
    const crumb = scrubBreadcrumb({
      category: "xhr",
      message: UPLOAD_URL,
      data: { url: UPLOAD_URL, status_code: 200 }
    });
    expect(crumb.message).toBe(SCRUBBED);
    expect(crumb.data).toEqual({ url: SCRUBBED, status_code: 200 });
  });
});
