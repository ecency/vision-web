import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractPermlink, getUploadTuning } from "@/api/threespeak-embed/api";
import type { TusRefusalError } from "@/api/threespeak-embed/upload-limits";

// The 3Speak proxy now requires a HiveSigner OAuth token resolved from
// localStorage + user-token. These tests exercise fetch error propagation,
// not the auth path, so we stub the auth helpers to return a valid token.
vi.mock("@/utils/local-storage", () => ({
  get: vi.fn(() => "testuser")
}));
const tokens = vi.hoisted(() => ({ fresh: "valid-hs-token" as string | undefined }));
vi.mock("@/utils/user-token", () => ({
  getAccessToken: vi.fn(() => "valid-hs-token"),
  ensureValidTokenWithin: vi.fn(async () => tokens.fresh)
}));

// Drive tus-js-client's upload callbacks deterministically. `runUpload` is set
// per-test to simulate the sequence of onAfterResponse / onSuccess calls.
type TusPart = { abort: (shouldTerminate?: boolean) => Promise<void> };
type TusInstance = { _parallelUploads: TusPart[] | null };

const tusMock = vi.hoisted(() => ({
  runUpload: (_options: any) => {},
  // The argument of every abort() call, in order.
  aborts: [] as Array<boolean | undefined>,
  starts: 0,
  onStart: undefined as ((instance: TusInstance) => void) | undefined
}));

vi.mock("tus-js-client", () => ({
  // tus's default retry rule, which the upload defers to when not aborted.
  defaultOptions: { onShouldRetry: () => false },
  Upload: class {
    options: any;
    constructor(_file: unknown, options: any) {
      this.options = options;
    }
    _parallelUploads: TusPart[] | null = null;
    start() {
      tusMock.starts += 1;
      tusMock.onStart?.(this);
      tusMock.runUpload(this.options);
    }
    abort(shouldTerminate?: boolean) {
      tusMock.aborts.push(shouldTerminate);
      // Like tus: the parent aborts each part and drops the returned promises.
      for (const part of this._parallelUploads ?? []) part.abort(shouldTerminate);
      return Promise.resolve();
    }
  }
}));

// A tus response whose getHeader returns `embedUrl` for the X-Embed-URL header.
function mockRes(embedUrl: string | null) {
  return { getHeader: (h: string) => (/^x-embed-url$/i.test(h) ? embedUrl : null) };
}
// A tus request whose getHeader returns `uploadConcat` for Upload-Concat.
function mockReq(uploadConcat?: string) {
  return { getHeader: (h: string) => (h === "Upload-Concat" ? uploadConcat : undefined) };
}

describe("extractPermlink", () => {
  it("extracts permlink from ?v=user/permlink format", () => {
    expect(extractPermlink("https://play.3speak.tv/embed?v=alice/abcd1234")).toBe("abcd1234");
  });

  it("extracts permlink from @user/permlink format", () => {
    expect(extractPermlink("@alice/abcd1234")).toBe("abcd1234");
  });

  it("falls back to last segment", () => {
    expect(extractPermlink("https://example.com/videos/abcd1234")).toBe("abcd1234");
  });

  it("strips query params from last segment", () => {
    expect(extractPermlink("https://example.com/abcd1234?foo=bar")).toBe("abcd1234");
  });
});

describe("requestUploadToken error handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches HTTP status to thrown error on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('{"error":"3Speak integration not configured"}')
      })
    );

    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    const file = new File(["test"], "test.mp4", { type: "video/mp4" });

    try {
      await uploadVideoEmbed(file, "testuser", true, () => {});
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(Error);
      expect(e.status).toBe(503);
      expect(e.message).toContain("503");
    }
  });

  it("attaches 401 status when auth fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('{"error":"Authentication required"}')
      })
    );

    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    const file = new File(["test"], "test.mp4", { type: "video/mp4" });

    try {
      await uploadVideoEmbed(file, "testuser", true, () => {});
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.status).toBe(401);
    }
  });
});

describe("getUploadTuning", () => {
  const MB = 1024 * 1024;

  it("keeps small files (<= 10 MB) sequential", () => {
    expect(getUploadTuning(0)).toEqual({ chunkSize: 5 * MB, parallelUploads: 1 });
    expect(getUploadTuning(1024)).toEqual({ chunkSize: 5 * MB, parallelUploads: 1 });
    expect(getUploadTuning(10 * MB)).toEqual({ chunkSize: 5 * MB, parallelUploads: 1 });
  });

  it("uses 10 MB x 3 parallel above 10 MB up to 500 MB", () => {
    expect(getUploadTuning(10 * MB + 1)).toEqual({ chunkSize: 10 * MB, parallelUploads: 3 });
    expect(getUploadTuning(100 * MB)).toEqual({ chunkSize: 10 * MB, parallelUploads: 3 });
    expect(getUploadTuning(500 * MB)).toEqual({ chunkSize: 10 * MB, parallelUploads: 3 });
  });

  it("uses 20 MB x 3 parallel above 500 MB", () => {
    expect(getUploadTuning(500 * MB + 1)).toEqual({ chunkSize: 20 * MB, parallelUploads: 3 });
    expect(getUploadTuning(2 * 1024 * MB)).toEqual({ chunkSize: 20 * MB, parallelUploads: 3 });
  });
});

// > 10 MB so getUploadTuning selects parallelUploads = 3.
const bigFile = () =>
  new File([new Uint8Array(11 * 1024 * 1024)], "big.mp4", { type: "video/mp4" });
// <= 10 MB so getUploadTuning selects parallelUploads = 1 (sequential).
const smallFile = () => new File(["x"], "small.mp4", { type: "video/mp4" });

function stubTokenResponse(extra: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ token: "tok", upload_url: "https://embed.example/uploads", ...extra })
    })
  );
}

describe("uploadVideoEmbed with a token-bound permlink (preferred path)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // New backend: the token response carries the canonical embed URL up front.
    stubTokenResponse({
      permlink: "TOK12345",
      embed_url: "https://play.3speak.tv/embed?v=a/TOK12345"
    });
  });

  it("keeps parallel uploads on for big files and resolves with the token URL", async () => {
    let seenParallel = -1;
    tusMock.runUpload = (options) => {
      seenParallel = options.parallelUploads;
      // No header capture — success alone resolves to the token's embed URL.
      options.onSuccess();
    };
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    await expect(uploadVideoEmbed(bigFile(), "a", false, () => {})).resolves.toEqual({
      embedUrl: "https://play.3speak.tv/embed?v=a/TOK12345",
      permlink: "TOK12345"
    });
    expect(seenParallel).toBe(3);
  });

  it("uploads small files sequentially and resolves with the token URL", async () => {
    let seenParallel = -1;
    tusMock.runUpload = (options) => {
      seenParallel = options.parallelUploads;
      options.onSuccess();
    };
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    await expect(uploadVideoEmbed(smallFile(), "a", false, () => {})).resolves.toEqual({
      embedUrl: "https://play.3speak.tv/embed?v=a/TOK12345",
      permlink: "TOK12345"
    });
    expect(seenParallel).toBe(1);
  });

  it("never re-uploads: a failed upload rejects without a second attempt", async () => {
    let attempts = 0;
    tusMock.runUpload = (options) => {
      attempts += 1;
      options.onError(new Error("network down"));
    };
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    await expect(uploadVideoEmbed(bigFile(), "a", false, () => {})).rejects.toThrow(/network down/);
    expect(attempts).toBe(1);
  });
});

describe("uploadVideoEmbed against a legacy backend (header fallback)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Old backend: no permlink/embed_url in the token response.
    stubTokenResponse();
  });

  it("uploads sequentially even for big files and reads the X-Embed-URL header", async () => {
    let seenParallel = -1;
    tusMock.runUpload = (options) => {
      seenParallel = options.parallelUploads;
      options.onAfterResponse(mockReq(), mockRes("https://play.3speak.tv/embed?v=a/SEQ12345"));
      options.onSuccess();
    };
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    await expect(uploadVideoEmbed(bigFile(), "a", false, () => {})).resolves.toEqual({
      embedUrl: "https://play.3speak.tv/embed?v=a/SEQ12345",
      permlink: "SEQ12345"
    });
    // Legacy path must avoid the racy parallel/concat header delivery.
    expect(seenParallel).toBe(1);
  });

  it("falls back to the header path when the token carries only a permlink", async () => {
    // Partial token response (permlink but no embed_url) must not be treated as
    // the preferred path — it should fall through to the sequential header path.
    stubTokenResponse({ permlink: "TOK12345" });
    let seenParallel = -1;
    tusMock.runUpload = (options) => {
      seenParallel = options.parallelUploads;
      options.onAfterResponse(mockReq(), mockRes("https://play.3speak.tv/embed?v=a/SEQ99999"));
      options.onSuccess();
    };
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    await expect(uploadVideoEmbed(bigFile(), "a", false, () => {})).resolves.toEqual({
      embedUrl: "https://play.3speak.tv/embed?v=a/SEQ99999",
      permlink: "SEQ99999"
    });
    expect(seenParallel).toBe(1);
  });

  it("rejects when the backend returns no embed URL header", async () => {
    tusMock.runUpload = (options) => {
      options.onSuccess();
    };
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    await expect(uploadVideoEmbed(smallFile(), "a", false, () => {})).rejects.toThrow(
      /no embed URL was returned/
    );
  });

  it("propagates the upload error", async () => {
    tusMock.runUpload = (options) => {
      options.onError(new Error("network down"));
    };
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    await expect(uploadVideoEmbed(smallFile(), "a", false, () => {})).rejects.toThrow(/network down/);
  });
});

// Closing the dialog or switching account aborts the upload: the TUS upload
// stops and asks the server to delete the partial file (abort(true)).
describe("aborting an upload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    tusMock.aborts = [];
    tusMock.starts = 0;
  });

  // Never finishes on its own, like a large file still in flight.
  const hang = () => {
    tusMock.runUpload = () => {};
  };

  it.each([
    ["preferred path", { permlink: "TOK12345", embed_url: "https://play.3speak.tv/embed?v=a/TOK12345" }],
    ["legacy header path", {}]
  ])("an abort mid-upload terminates the TUS upload and rejects (%s)", async (_name, extra) => {
    stubTokenResponse(extra);
    hang();
    const controller = new AbortController();
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    const upload = uploadVideoEmbed(bigFile(), "a", false, () => {}, controller.signal);
    await vi.waitFor(() => expect(tusMock.starts).toBe(1));

    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    expect(tusMock.aborts).toEqual([true]);
  });

  it("a failed DELETE of a parallel part does not surface as an unhandled rejection", async () => {
    stubTokenResponse({ permlink: "TOK12345", embed_url: "https://play.3speak.tv/embed?v=a/TOK12345" });
    const partAborts: Array<boolean | undefined> = [];
    // A plain function: vi.fn would attach its own handler to the promise it returns.
    let terminations = 0;
    const failedTerminate = () => {
      terminations += 1;
      return Promise.reject(new Error("tus: failed to terminate upload"));
    };
    // tus keeps the parts of a parallel upload in _parallelUploads; its own
    // abort(true) drops the promise each part's DELETE returns.
    tusMock.runUpload = () => {};
    tusMock.onStart = (instance) => {
      instance._parallelUploads = [0, 1, 2].map(() => ({
        abort: (shouldTerminate?: boolean) => {
          partAborts.push(shouldTerminate);
          return shouldTerminate ? failedTerminate() : Promise.resolve();
        }
      }));
    };
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const controller = new AbortController();
      const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
      const upload = uploadVideoEmbed(bigFile(), "a", false, () => {}, controller.signal);
      await vi.waitFor(() => expect(tusMock.starts).toBe(1));

      controller.abort();

      await expect(upload).rejects.toMatchObject({ name: "AbortError" });
      await new Promise((r) => setTimeout(r, 10));
      // Every part is terminated, and every failure is handled.
      expect(terminations).toBe(3);
      expect(partAborts.filter((t) => t === true)).toHaveLength(3);
      // The parent only stops; it has no upload of its own to delete yet.
      expect(tusMock.aborts).toEqual([false]);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
      tusMock.onStart = undefined;
    }
  });

  // tus sets up asynchronously after start() (fingerprint, file read, part
  // slicing) and resets its own aborted flag on the way, so an abort that lands
  // in that window must still keep every request from going out.
  it.each([
    ["preferred path", { permlink: "TOK12345", embed_url: "https://play.3speak.tv/embed?v=a/TOK12345" }],
    ["legacy header path", {}]
  ])("an abort during TUS start-up sends no upload request (%s)", async (_name, extra) => {
    stubTokenResponse(extra);
    let finishSetup: () => void = () => {};
    const sent: string[] = [];
    const request = (method: string) => ({ getMethod: () => method });
    tusMock.runUpload = (options) => {
      void new Promise<void>((resolve) => (finishSetup = resolve)).then(async () => {
        // The create POST, then the termination DELETE tus may still send.
        for (const method of ["POST", "DELETE"]) {
          try {
            await options.onBeforeRequest?.(request(method));
            sent.push(method);
          } catch (e) {
            if (method === "POST") options.onError(e);
          }
        }
      });
    };
    const controller = new AbortController();
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    const upload = uploadVideoEmbed(bigFile(), "a", false, () => {}, controller.signal);
    await vi.waitFor(() => expect(tusMock.starts).toBe(1));

    controller.abort();
    finishSetup();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(sent).toEqual(["DELETE"]));
  });

  it("requests go out normally while the upload is not aborted", async () => {
    stubTokenResponse({ permlink: "TOK12345", embed_url: "https://play.3speak.tv/embed?v=a/TOK12345" });
    tusMock.runUpload = async (options) => {
      await options.onBeforeRequest?.({ getMethod: () => "PATCH" });
      options.onSuccess();
    };
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");

    await expect(
      uploadVideoEmbed(smallFile(), "a", false, () => {}, new AbortController().signal)
    ).resolves.toMatchObject({ permlink: "TOK12345" });
  });

  it("an already aborted signal requests no token and starts no upload", async () => {
    stubTokenResponse({ permlink: "TOK12345", embed_url: "https://play.3speak.tv/embed?v=a/TOK12345" });
    const controller = new AbortController();
    controller.abort();
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");

    await expect(
      uploadVideoEmbed(smallFile(), "a", false, () => {}, controller.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
    expect(tusMock.starts).toBe(0);
  });

  it.each([
    ["preferred path", { permlink: "TOK12345", embed_url: "https://play.3speak.tv/embed?v=a/TOK12345" }],
    ["legacy header path", {}]
  ])("an abort while the token is being issued starts no upload (%s)", async (_name, extra) => {
    const controller = new AbortController();
    let answerToken: () => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            answerToken = () =>
              resolve({
                ok: true,
                json: () =>
                  Promise.resolve({ token: "tok", upload_url: "https://embed.example/uploads", ...extra })
              });
          })
      )
    );
    hang();
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    const upload = uploadVideoEmbed(smallFile(), "a", false, () => {}, controller.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    // The signal reaches the token request.
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBe(controller.signal);

    controller.abort();
    // A fetch that answers anyway (the abort raced the response) is still ignored.
    answerToken();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    expect(tusMock.starts).toBe(0);
  });

  it.each([
    ["preferred path", { permlink: "TOK12345", embed_url: "https://play.3speak.tv/embed?v=a/TOK12345" }],
    ["legacy header path", {}]
  ])("an abort after the upload finished does not delete it (%s)", async (_name, extra) => {
    stubTokenResponse(extra);
    tusMock.runUpload = (options) => {
      options.onAfterResponse?.(mockReq(), mockRes("https://play.3speak.tv/embed?v=a/TOK12345"));
      options.onSuccess();
    };
    const controller = new AbortController();
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");

    await expect(
      uploadVideoEmbed(smallFile(), "a", false, () => {}, controller.signal)
    ).resolves.toMatchObject({ permlink: "TOK12345" });
    controller.abort();

    expect(tusMock.aborts).toEqual([]);
  });

  it.each([
    ["preferred path", { permlink: "TOK12345", embed_url: "https://play.3speak.tv/embed?v=a/TOK12345" }],
    ["legacy header path", {}]
  ])("an abort after a failed upload does not terminate it a second time (%s)", async (_name, extra) => {
    stubTokenResponse(extra);
    tusMock.runUpload = (options) => options.onError(new Error("network down"));
    const controller = new AbortController();
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");

    await expect(
      uploadVideoEmbed(smallFile(), "a", false, () => {}, controller.signal)
    ).rejects.toThrow(/network down/);
    controller.abort();

    // Only the error path's own abort(), which keeps the partial upload resumable.
    expect(tusMock.aborts).toEqual([undefined]);
  });
});

// The server refuses a token past its lifetime, so an expired one is renewed
// before it is sent; if renewing fails (HiveSigner down) the cached one goes,
// as before.
describe("3Speak auth code", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    tokens.fresh = "valid-hs-token";
  });

  const sentCode = async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("{}")
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    await uploadVideoEmbed(new File(["t"], "t.mp4", { type: "video/mp4" }), "testuser", true, () => {}).catch(() => {});
    return JSON.parse(fetchSpy.mock.calls[0][1].body).code;
  };

  it("sends the renewed token", async () => {
    tokens.fresh = "renewed-token";
    expect(await sentCode()).toBe("renewed-token");
  });

  it("sends the stored token the renewal helper falls back to", async () => {
    tokens.fresh = "stored-token";
    expect(await sentCode()).toBe("stored-token");
  });
});

// 3Speak daily upload limits for free accounts: the token route answers 429
// with code "daily_upload_limit". The client must stop there, with the
// refusal attached, and never start a TUS upload or try another path.
describe("daily upload limit", () => {
  const LIMIT_BODY = {
    error: "Daily video upload limit reached",
    code: "daily_upload_limit",
    kind: "video",
    limit: 1,
    used: 1,
    next_at: "2026-11-21T14:32:00Z",
    retry_after_seconds: 52320,
    message: "Free accounts can upload 1 video per 24 hours.",
    upgrade_url: "https://3speak.tv/wallet/a#pro"
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    tokens.fresh = "valid-hs-token";
  });

  it("a 429 from the token route throws the limit and starts no upload", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve(JSON.stringify(LIMIT_BODY))
    });
    vi.stubGlobal("fetch", fetchSpy);
    let tusStarts = 0;
    tusMock.runUpload = () => {
      tusStarts += 1;
    };

    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    const { isThreeSpeakUploadLimitError } = await import("@/api/threespeak-embed/upload-limits");

    const err = await uploadVideoEmbed(smallFile(), "a", false, () => {}).catch((e) => e);
    expect(isThreeSpeakUploadLimitError(err)).toBe(true);
    expect(err.status).toBe(429);
    expect(err.limit).toMatchObject({
      kind: "video",
      limit: 1,
      nextAt: "2026-11-21T14:32:00Z",
      message: LIMIT_BODY.message,
      upgradeUrl: "https://3speak.tv/wallet/a#pro"
    });
    // One token request, no TUS upload, no fallback request.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(tusStarts).toBe(0);
  });

  it("a 429 without the limit code stays a plain error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('{"error":"Too many requests"}')
      })
    );
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    const { isThreeSpeakUploadLimitError } = await import("@/api/threespeak-embed/upload-limits");

    const err = await uploadVideoEmbed(smallFile(), "a", false, () => {}).catch((e) => e);
    expect(isThreeSpeakUploadLimitError(err)).toBe(false);
    expect(err.status).toBe(429);
  });

  it("a TUS create refused over the limit throws the limit, once", async () => {
    stubTokenResponse({
      permlink: "TOK12345",
      embed_url: "https://play.3speak.tv/embed?v=a/TOK12345"
    });
    let attempts = 0;
    tusMock.runUpload = (options) => {
      attempts += 1;
      const tusError: TusRefusalError = new Error("tus: unexpected response while creating upload");
      tusError.originalResponse = {
        getStatus: () => 429,
        getBody: () => JSON.stringify({ ...LIMIT_BODY, kind: "short", limit: 3, used: 3 })
      };
      options.onError(tusError);
    };
    const { uploadVideoEmbed } = await import("@/api/threespeak-embed/api");
    const { isThreeSpeakUploadLimitError } = await import("@/api/threespeak-embed/upload-limits");

    const err = await uploadVideoEmbed(bigFile(), "a", true, () => {}).catch((e) => e);
    expect(isThreeSpeakUploadLimitError(err)).toBe(true);
    expect(err.limit).toMatchObject({ kind: "short", limit: 3 });
    expect(attempts).toBe(1);
  });
});

describe("getUploadQuota", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    tokens.fresh = "valid-hs-token";
  });

  it("returns the parsed quota", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            enabled: true,
            exempt: false,
            video: { limit: 1, used: 1, remaining: 0, next_at: "2026-11-21T14:32:00Z" },
            short: { limit: 3, used: 0, remaining: 3, next_at: null }
          })
      })
    );
    const { getUploadQuota } = await import("@/api/threespeak-embed/api");
    await expect(getUploadQuota("a")).resolves.toMatchObject({
      enabled: true,
      exempt: false,
      video: { remaining: 0, nextAt: "2026-11-21T14:32:00Z" }
    });
  });

  it("a 404 or a network failure means no limit is known", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { getUploadQuota } = await import("@/api/threespeak-embed/api");
    await expect(getUploadQuota("a")).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(getUploadQuota("a")).resolves.toBeNull();
  });
});
