import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
// ServiceWorkerRecovery is imported dynamically per-test (see beforeEach) to reset
// its module-level reload guards; the pure helpers are imported statically.
import {
  isChunkLoadError,
  isDeploySkewError
} from "@/features/pwa-install/service-worker-recovery";

describe("isChunkLoadError", () => {
  it("matches the chunk / dynamic-import failure messages", () => {
    expect(isChunkLoadError("ChunkLoadError: something")).toBe(true);
    expect(isChunkLoadError("Loading chunk 482 failed")).toBe(true);
    expect(isChunkLoadError("Loading CSS chunk 5 failed")).toBe(true);
    expect(isChunkLoadError("Failed to fetch dynamically imported module: /a.js")).toBe(true);
    expect(isChunkLoadError("error loading dynamically imported module")).toBe(true);
    expect(isChunkLoadError("Importing a module script failed.")).toBe(true);
  });

  it("ignores unrelated errors and empty input", () => {
    expect(isChunkLoadError("TypeError: x is not a function")).toBe(false);
    expect(isChunkLoadError("")).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("isDeploySkewError", () => {
  it("matches chunk-load errors (string or Error)", () => {
    expect(isDeploySkewError("ChunkLoadError: x")).toBe(true);
    expect(isDeploySkewError(new Error("Loading chunk 7 failed"))).toBe(true);
  });

  it("matches the webpack factory mismatch ONLY when thrown from the webpack runtime", () => {
    // The real post-deploy crash: undefined module factory in webpack-*.js.
    expect(
      isDeploySkewError({
        message: "Cannot read properties of undefined (reading 'call')",
        stack: "at a (https://ecency.com/_next/static/chunks/webpack-2bcfd50e3f341c1.js:1:1)"
      })
    ).toBe(true);
    // Safari phrasing, also from the webpack runtime.
    expect(
      isDeploySkewError({
        message: "undefined is not an object (evaluating 'r.call')",
        stack: "webpack-internal:///./node_modules/x"
      })
    ).toBe(true);
    // Firefox phrasing (ECENCY-NEXT-1FMZ).
    expect(
      isDeploySkewError({
        message: 'can\'t access property "call", e[c] is undefined',
        stack: "at a (https://ecency.com/_next/static/chunks/webpack-2bcfd50e.js:1:1)"
      })
    ).toBe(true);
  });

  it("does NOT fire on an unrelated `.call of undefined` app bug (no webpack frame)", () => {
    expect(
      isDeploySkewError({
        message: "Cannot read properties of undefined (reading 'call')",
        stack: "at handleClick (https://ecency.com/_next/static/chunks/app/page.js:5:9)"
      })
    ).toBe(false);
  });

  it("does NOT fire on a different undefined read even from the webpack runtime", () => {
    expect(
      isDeploySkewError({
        message: "Cannot read properties of undefined (reading 'foo')",
        stack: "at a (https://ecency.com/_next/static/chunks/webpack-abc.js:1:1)"
      })
    ).toBe(false);
  });

  it("ignores non-error input", () => {
    expect(isDeploySkewError(null)).toBe(false);
    expect(isDeploySkewError(undefined)).toBe(false);
    expect(isDeploySkewError(42)).toBe(false);
  });

  describe("mixed-build frames (foreign ?dpl) — ECENCY-NEXT-1GNN", () => {
    beforeEach(() => {
      // The own build id derives from SENTRY_RELEASE exactly as next.config.js
      // builds `deploymentId`: strip the app prefix, keep the first 8 hex.
      vi.stubEnv("SENTRY_RELEASE", "ecency-next@9e6dd083a2a19c103c2bf813a8bd2a8dd3ad9a83");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("matches an error executing a chunk from a DIFFERENT deployment", () => {
      // The real crash shape: the foreign chunk LOADED fine (CDN cache), so no
      // ChunkLoadError — it binds shifted module ids and a named export comes
      // back undefined. No message grammar is required; the dpl mismatch alone
      // proves a mixed build.
      expect(
        isDeploySkewError({
          message: "(0 , y.useNewsletterEnabled) is not a function",
          stack:
            "TypeError: (0 , y.useNewsletterEnabled) is not a function\n" +
            "    at x (https://ecency.com/_next/static/chunks/app/page-77d004dc07e923a7.js?dpl=67bf6584:1:7873)\n" +
            "    at l9 (https://ecency.com/_next/static/chunks/fab31ea0-a826f330bcfe7eac.js?dpl=9e6dd083:1:51471)"
        })
      ).toBe(true);
    });

    it("does NOT match when every frame is from this build", () => {
      expect(
        isDeploySkewError({
          message: "(0 , y.useNewsletterEnabled) is not a function",
          stack:
            "    at x (https://ecency.com/_next/static/chunks/app/page-abc123.js?dpl=9e6dd083:1:7873)\n" +
            "    at l9 (https://ecency.com/_next/static/chunks/fab31ea0-a826f330bcfe7eac.js?dpl=9e6dd083:1:51471)"
        })
      ).toBe(false);
    });

    it("does NOT match a third-party script carrying its own dpl query", () => {
      // A foreign script's dpl value is unrelated to our builds — classifying
      // it as skew would burn the session's one guarded reload and bury the
      // real error under the skew fingerprint.
      expect(
        isDeploySkewError({
          message: "foreignSdk is not a function",
          stack:
            "    at init (https://cdn.example.com/analytics/sdk.js?dpl=deadbeef:1:100)\n" +
            "    at l9 (https://ecency.com/_next/static/chunks/fab31ea0-a826f330bcfe7eac.js?dpl=9e6dd083:1:51471)"
        })
      ).toBe(false);
    });

    it("does NOT match a dpl value that isn't the 8-hex id our builds bake", () => {
      expect(
        isDeploySkewError({
          message: "x is not a function",
          stack:
            "    at x (https://ecency.com/_next/static/chunks/app/page-abc123.js?dpl=67bf65841bc03b34:1:1)"
        })
      ).toBe(false);
    });

    it("does NOT match dpl-less frames, and is inert when SENTRY_RELEASE is unset", () => {
      // No dpl in the stack (an app bug on a normal build) — never skew.
      expect(
        isDeploySkewError({
          message: "x is not a function",
          stack: "    at x (https://ecency.com/_next/static/chunks/app/page-abc123.js:1:7873)"
        })
      ).toBe(false);

      // Local dev: no release inlined, so there is no own id to compare against.
      vi.stubEnv("SENTRY_RELEASE", undefined);
      expect(
        isDeploySkewError({
          message: "x is not a function",
          stack: "    at x (https://ecency.com/_next/static/chunks/app/page-abc123.js?dpl=67bf6584:1:1)"
        })
      ).toBe(false);
    });
  });
});

describe("ServiceWorkerRecovery", () => {
  let reloadMock: ReturnType<typeof vi.fn>;
  const realLocation = window.location;
  let Recovery: (typeof import("@/features/pwa-install/service-worker-recovery"))["ServiceWorkerRecovery"];

  function mockServiceWorker(controller: object | null) {
    const target = Object.assign(new EventTarget(), { controller });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: target });
    return target;
  }

  beforeEach(async () => {
    sessionStorage.clear();
    reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, reload: reloadMock }
    });
    // Re-import per test so the module-level reload guards (controllerReloadStarted)
    // reset and can't leak between tests.
    vi.resetModules();
    Recovery = (await import("@/features/pwa-install/service-worker-recovery"))
      .ServiceWorkerRecovery;
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    document.head.querySelectorAll("[data-test-asset]").forEach((el) => el.remove());
    document.body.querySelectorAll("[data-test-asset]").forEach((el) => el.remove());
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // Resource-load failures fire only in the capture phase and don't bubble; the
  // window capture listener still receives them when the element is in the tree.
  function dispatchResourceError(el: HTMLElement) {
    el.dataset.testAsset = "1";
    document.head.appendChild(el);
    el.dispatchEvent(new Event("error"));
  }

  const origin = window.location.origin;

  it("reloads when a /_next/static stylesheet 404s (silently unstyled, no JS error)", () => {
    render(<Recovery />);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${origin}/_next/static/css/abc123.css`;
    dispatchResourceError(link);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("reloads when a /_next/static script 404s", () => {
    render(<Recovery />);
    const script = document.createElement("script");
    script.src = `${origin}/_next/static/chunks/102-deadbeef.js`;
    dispatchResourceError(script);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("ignores asset errors that are not build-versioned /_next/static", () => {
    render(<Recovery />);
    // Same-origin asset outside /_next/static.
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${origin}/fonts/inter.css`;
    dispatchResourceError(link);
    // Broken image.
    const img = document.createElement("img");
    img.src = `${origin}/u/foo/avatar.png`;
    dispatchResourceError(img);
    // Foreign-origin URL that merely contains the /_next/static substring — not
    // our build, must not burn the session's one reload.
    const foreign = document.createElement("script");
    foreign.src = "https://cdn.example.com/_next/static/widget.js";
    dispatchResourceError(foreign);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  describe("build-id heartbeat", () => {
    function mockVersionFetch(buildId: string | null, ok = true) {
      const fetchMock = vi.fn().mockResolvedValue({
        ok,
        json: async () => ({ buildId })
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("reloads when the deployed build differs (stale tab refocus)", async () => {
      vi.stubEnv("SENTRY_RELEASE", "ecency-next@oldsha");
      const fetchMock = mockVersionFetch("ecency-next@newsha");
      render(<Recovery />);

      document.dispatchEvent(new Event("visibilitychange"));

      await waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledWith("/api/version", { cache: "no-store" });
    });

    it("does not reload when the build id matches", async () => {
      vi.stubEnv("SENTRY_RELEASE", "ecency-next@samesha");
      mockVersionFetch("ecency-next@samesha");
      render(<Recovery />);

      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 0));

      expect(reloadMock).not.toHaveBeenCalled();
    });

    it("is inert when SENTRY_RELEASE is unset (local dev) — no /api/version poll", async () => {
      vi.stubEnv("SENTRY_RELEASE", undefined);
      const fetchMock = mockVersionFetch("ecency-next@newsha");
      render(<Recovery />);

      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 0));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(reloadMock).not.toHaveBeenCalled();
    });

    it("throttles rapid refocus to a single poll", async () => {
      vi.stubEnv("SENTRY_RELEASE", "ecency-next@samesha");
      const fetchMock = mockVersionFetch("ecency-next@samesha");
      render(<Recovery />);

      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 0));

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("reloads once on a chunk-load error, then not again in the same session", () => {
    render(<Recovery />);

    window.dispatchEvent(
      new ErrorEvent("error", { message: "ChunkLoadError: Loading chunk 7 failed" })
    );
    expect(reloadMock).toHaveBeenCalledTimes(1);

    // Session guard: a second chunk error must NOT trigger another reload loop.
    window.dispatchEvent(
      new ErrorEvent("error", { message: "ChunkLoadError: Loading chunk 9 failed" })
    );
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("reloads on an uncaught webpack factory mismatch (post-deploy skew)", () => {
    render(<Recovery />);

    const error = Object.assign(new Error("Cannot read properties of undefined (reading 'call')"), {
      stack: "at a (https://ecency.com/_next/static/chunks/webpack-2bcfd50e.js:1:1)"
    });
    window.dispatchEvent(new ErrorEvent("error", { message: error.message, error }));
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("does not reload on unrelated errors", () => {
    render(<Recovery />);

    window.dispatchEvent(new ErrorEvent("error", { message: "TypeError: boom" }));
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("recovers from a rejected dynamic import", () => {
    render(<Recovery />);

    // jsdom's PromiseRejectionEvent constructor is unreliable; dispatch a plain
    // event carrying `reason`, which is all the handler reads.
    const event = new Event("unhandledrejection") as Event & { reason?: unknown };
    event.reason = new Error("Failed to fetch dynamically imported module: /_next/x.js");
    window.dispatchEvent(event);

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("does not reload when sessionStorage is unusable (no reload loop)", () => {
    render(<Recovery />);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    window.dispatchEvent(new ErrorEvent("error", { message: "ChunkLoadError: x" }));

    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("reloads once when a new service worker takes control of an already-controlled page", () => {
    const sw = mockServiceWorker({}); // controller present at mount → armed
    render(<Recovery />);

    sw.dispatchEvent(new Event("controllerchange"));
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("does not reload on controllerchange when the page had no controller at mount", () => {
    const sw = mockServiceWorker(null); // no controller → not armed (initial claim)
    render(<Recovery />);

    sw.dispatchEvent(new Event("controllerchange"));
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
