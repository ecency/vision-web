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

  it("redacts names ENDING in _secret or _token (Stripe return URL)", () => {
    expect(
      scrubUrlSecrets(
        "https://ecency.com/points/gift?payment_intent=pi_1&payment_intent_client_secret=pi_1_secret_X&redirect_status=succeeded"
      )
    ).toBe(
      "https://ecency.com/points/gift?payment_intent=pi_1&payment_intent_client_secret=[Filtered]&redirect_status=succeeded"
    );
    expect(scrubUrlSecrets("/x?csrf_token=C&page=2")).toBe("/x?csrf_token=[Filtered]&page=2");
    // Pagination cursors are not credentials.
    for (const name of ["page_token", "next_token", "continuation_token"]) {
      expect(scrubUrlSecrets(`/list?${name}=CURSOR`)).toBe(`/list?${name}=CURSOR`);
    }
  });

  it("leaves the /hs/@author/permlink tag route alone but redacts /hs/<token>", () => {
    expect(scrubUrlSecrets("https://ecency.com/hs/@alice/my-post")).toBe(
      "https://ecency.com/hs/@alice/my-post"
    );
    expect(scrubUrlSecrets("https://ecency.com/hs/abc")).toBe("https://ecency.com/hs/[Filtered]");
  });

  it("leaves non-matching URLs untouched", () => {
    const urls = [
      "https://i.ecency.com/u/alice/avatar/small",
      "https://ecency.com/hive-123/@alice/my-post?ref=home",
      "https://api.hive.blog/?tokenizer=1",
      "https://ecency.com/created/hs",
      "https://ecency.com/newsletter",
      "https://ecency.com/x?payment_intent=pi_1&redirect_status=succeeded&tokens=5&secretary=1"
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

  // Scrub-first ordering: these rules return early, before the end of beforeSend.
  it("scrubs before the AbortError early return (crumb and timeoutUrl tag)", () => {
    const out = beforeSend(
      baseEvent({
        exception: { values: [{ type: "AbortError", value: "The user aborted a request." }] },
        breadcrumbs: [{ category: "fetch", data: { url: UPLOAD_URL } }]
      })
    );
    expect(out!.fingerprint).toEqual(["cancellation-abort-unhandled"]);
    expect((out!.breadcrumbs![0].data as { url: string }).url).toBe(SCRUBBED);
    expect(out!.tags!.timeoutUrl).toBe(SCRUBBED);
  });

  it("scrubs before the deploy-skew early return, keeping the chunk ?dpl= query", () => {
    const chunk = "app:///_next/static/chunks/webpack-9732e1c31d36b1a3.js?dpl=dpl_abc";
    const out = beforeSend(
      baseEvent({
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot read properties of undefined (reading 'call')",
              stacktrace: { frames: [{ filename: chunk, abs_path: chunk }] }
            }
          ]
        },
        breadcrumbs: [{ category: "xhr", data: { url: UPLOAD_URL } }]
      })
    );
    expect(out!.fingerprint).toEqual(["deploy-skew-auto-recovered"]);
    expect((out!.breadcrumbs![0].data as { url: string }).url).toBe(SCRUBBED);
    expect(out!.exception!.values![0].stacktrace!.frames![0].filename).toBe(chunk);
  });

  it("stack frame filename, abs_path and module (page-attributed frames)", () => {
    const page = "app:///auth?code=C1";
    const frame = { filename: page, abs_path: page, module: page };
    const out = beforeSend(
      baseEvent({
        exception: {
          values: [
            {
              type: "Error",
              value: "x",
              stacktrace: { frames: [frame] }
            }
          ]
        }
      })
    );
    // Clones, not writes: the original frame object is left as it was.
    expect(frame.filename).toBe(page);
    expect(out!.exception!.values![0].stacktrace!.frames![0]).toEqual({
      filename: "app:///auth?code=[Filtered]",
      abs_path: "app:///auth?code=[Filtered]",
      module: "app:///auth?code=[Filtered]"
    });
  });

  it("nested shapes: console crumb data.arguments and extra.consoleHistory", () => {
    const out = beforeSend(
      baseEvent({
        breadcrumbs: [
          {
            category: "console",
            data: { arguments: ["upload", { url: UPLOAD_URL }], logger: "console" }
          }
        ],
        extra: {
          consoleHistory: [{ level: "error", message: `failed ${UPLOAD_URL}`, timestamp: 1 }]
        }
      })
    );
    expect(out!.breadcrumbs![0].data).toEqual({
      arguments: ["upload", { url: SCRUBBED }],
      logger: "console"
    });
    expect(out!.extra).toEqual({
      consoleHistory: [{ level: "error", message: `failed ${SCRUBBED}`, timestamp: 1 }]
    });
  });

  it("is copy-on-write: app-owned objects are never mutated", () => {
    // The exact object passed to console.error (the breadcrumb handler runs
    // BEFORE the real console call), a live console-history buffer entry and a
    // server request's live `req.headers`.
    const consoleArg = { url: UPLOAD_URL, headers: { Referer: UPLOAD_URL } };
    const historyEntry = { level: "error", message: UPLOAD_URL };
    const reqHeaders = { Referer: "https://ecency.com/auth?code=C1" };
    const out = beforeSend(
      baseEvent({
        breadcrumbs: [{ category: "console", data: { arguments: ["x", consoleArg] } }],
        extra: { consoleHistory: [historyEntry] },
        request: { url: "https://ecency.com/", headers: reqHeaders }
      })
    );
    expect(consoleArg).toEqual({ url: UPLOAD_URL, headers: { Referer: UPLOAD_URL } });
    expect(historyEntry).toEqual({ level: "error", message: UPLOAD_URL });
    expect(reqHeaders).toEqual({ Referer: "https://ecency.com/auth?code=C1" });
    expect(out!.breadcrumbs![0].data).toEqual({
      // `headers` is a 4th container level: Sentry sends it as "[Object]".
      arguments: ["x", { url: SCRUBBED, headers: consoleArg.headers }]
    });
    expect(out!.extra).toEqual({ consoleHistory: [{ level: "error", message: SCRUBBED }] });
    expect(out!.request!.headers).toEqual({ Referer: "https://ecency.com/auth?code=[Filtered]" });
  });

  it("keeps an unchanged value as the same reference", () => {
    const data = { url: "https://ecency.com/", nested: { a: "b" } };
    const out = beforeSend(baseEvent({ breadcrumbs: [{ category: "fetch", data }] }));
    expect(out!.breadcrumbs![0].data).toBe(data);
  });

  it("scrubs an Error's message and stack into a plain clone, leaving the Error alone", () => {
    const err = new Error(`upload to ${UPLOAD_URL} failed`);
    err.stack = `Error: upload to ${UPLOAD_URL} failed\n    at x (app:///p.js:1:1)`;
    const crumb = scrubBreadcrumb({ category: "console", data: { arguments: [err] } });
    const clone = (crumb.data as { arguments: Record<string, string>[] }).arguments[0];
    expect(clone).not.toBe(err);
    expect(clone.name).toBe("Error");
    expect(clone.message).toBe(`upload to ${SCRUBBED} failed`);
    expect(clone.stack).toContain(`upload to ${SCRUBBED} failed`);
    expect(err.message).toBe(`upload to ${UPLOAD_URL} failed`);
    // An Error with nothing to scrub is passed through for Sentry to normalize.
    const plain = new Error("nothing here");
    const kept = scrubBreadcrumb({ category: "console", data: { arguments: [plain] } });
    expect((kept.data as { arguments: unknown[] }).arguments[0]).toBe(plain);
  });

  it("scrubs a URL instance (serialized by Sentry through toJSON)", () => {
    const crumb = scrubBreadcrumb({
      category: "console",
      data: { arguments: [new URL(UPLOAD_URL)] }
    });
    expect((crumb.data as { arguments: unknown[] }).arguments[0]).toBe(SCRUBBED);
  });

  it("stops at Sentry's normalize bounds (depth 3, breadth 1000)", () => {
    // Four container levels below `extra`: Sentry sends "[Object]" there, so
    // it is left alone rather than walked.
    const deep = { a: { b: { url: UPLOAD_URL } } };
    const out = scrubSentryEvent({ extra: { deep, shallow: { url: UPLOAD_URL } } })!;
    expect((out.extra as { deep: unknown }).deep).toBe(deep);
    expect((out.extra as { shallow: { url: string } }).shallow.url).toBe(SCRUBBED);
    // Entries past 1000 are cut by Sentry ("[MaxProperties ~]"), never sent.
    const big = Array.from({ length: 1500 }, () => UPLOAD_URL);
    const crumb = scrubBreadcrumb({ category: "console", data: { arguments: big } });
    const args = (crumb.data as { arguments: string[] }).arguments;
    expect(args[999]).toBe(SCRUBBED);
    expect(args[1000]).toBe(UPLOAD_URL);
    expect(big[0]).toBe(UPLOAD_URL);
  });

  it("survives cycles", () => {
    const cyclic: Record<string, unknown> = { url: UPLOAD_URL };
    cyclic.self = cyclic;
    const out = scrubSentryEvent({ extra: { cyclic } })!;
    const scrubbed = (out.extra as { cyclic: Record<string, unknown> }).cyclic;
    expect(scrubbed.url).toBe(SCRUBBED);
    expect(cyclic.url).toBe(UPLOAD_URL);
  });

  it("drops the event instead of throwing when a location can be neither scrubbed nor removed", () => {
    const ev = Object.freeze(
      baseEvent({ request: Object.freeze({ url: "https://ecency.com/auth?code=C1" }) })
    ) as Ev;
    let out: Ev | null | undefined;
    expect(() => {
      out = beforeSend(ev);
    }).not.toThrow();
    expect(out).toBeNull();
  });

  it("clones a frozen or read-only child instead of removing the location", () => {
    const hostile = {} as Record<string, unknown>;
    Object.defineProperty(hostile, "url", {
      enumerable: true,
      get: () => UPLOAD_URL,
      set: () => {
        throw new Error("read-only");
      }
    });
    const out = beforeSend(
      baseEvent({
        breadcrumbs: [{ category: "fetch", data: hostile }],
        request: Object.freeze({ url: "https://ecency.com/auth?code=C1" })
      })
    );
    expect((out!.breadcrumbs![0].data as { url: string }).url).toBe(SCRUBBED);
    expect(out!.request!.url).toBe("https://ecency.com/auth?code=[Filtered]");
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

  it("never throws: a crumb that cannot be written is removed, not sent", () => {
    const crumb = Object.freeze({ category: "console", message: UPLOAD_URL });
    let out: Ev | null = null;
    expect(() => {
      out = beforeSend(baseEvent({ breadcrumbs: [crumb] }));
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

describe("scrubSentryEvent on transactions (server/edge beforeSendTransaction)", () => {
  it("scrubs the name, request, trace data and child spans", () => {
    const tx = scrubSentryEvent({
      type: "transaction",
      transaction: "GET /newsletter/confirm/N1",
      request: { url: "https://ecency.com/auth?code=C1", query_string: "code=C1" },
      contexts: {
        trace: {
          data: {
            "http.url": "https://ecency.com/auth?code=C1",
            // Sentry normalizes trace.data from its own root, so this nested
            // value is sent and must be walked too.
            "http.request.header": { referer: "https://ecency.com/auth?code=C1" }
          }
        }
      },
      spans: [
        {
          description: "GET https://hivesigner.com/api/oauth2/token?code=C1&client_secret=S1",
          data: {
            "url.full": "https://hivesigner.com/api/oauth2/token?code=C1&client_secret=S1",
            "http.url": "https://hivesigner.com/api/oauth2/token?code=C1&client_secret=S1",
            "http.target": "/api/oauth2/token?code=C1&client_secret=S1",
            "http.query": "?code=C1&client_secret=S1",
            "url.query": "code=C1&client_secret=S1",
            "server.address": "hivesigner.com",
            "http.response.status_code": 200
          }
        }
      ]
    })!;
    const filteredQs = "code=[Filtered]&client_secret=[Filtered]";
    expect(tx.transaction).toBe("GET /newsletter/confirm/[Filtered]");
    expect(tx.request!.url).toBe("https://ecency.com/auth?code=[Filtered]");
    expect(tx.request!.query_string).toBe("code=[Filtered]");
    expect(
      (tx.contexts as { trace: { data: Record<string, string> } }).trace.data["http.url"]
    ).toBe("https://ecency.com/auth?code=[Filtered]");
    expect(
      (tx.contexts as { trace: { data: Record<string, Record<string, string>> } }).trace.data[
        "http.request.header"
      ].referer
    ).toBe("https://ecency.com/auth?code=[Filtered]");
    expect(tx.spans![0].description).toBe(
      `GET https://hivesigner.com/api/oauth2/token?${filteredQs}`
    );
    expect(tx.spans![0].data).toEqual({
      "url.full": `https://hivesigner.com/api/oauth2/token?${filteredQs}`,
      "http.url": `https://hivesigner.com/api/oauth2/token?${filteredQs}`,
      "http.target": `/api/oauth2/token?${filteredQs}`,
      "http.query": `?${filteredQs}`,
      "url.query": filteredQs,
      "server.address": "hivesigner.com",
      "http.response.status_code": 200
    });
  });
});
