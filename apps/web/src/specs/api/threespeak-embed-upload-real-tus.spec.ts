import { describe, it, expect, vi, beforeEach } from "vitest";

// The real tus-js-client, with only its network layer faked, so the abort
// behaviour is pinned against the library and not against a mock of it.
vi.mock("@/utils/local-storage", () => ({ get: vi.fn(() => "alice") }));
vi.mock("@/utils/user-token", () => ({ ensureValidTokenWithin: vi.fn(async () => "hs-token") }));

const net = vi.hoisted(() => ({
  sent: [] as string[],
  // Every request tus opens, sent or refused before sending (a retry opens one).
  opened: [] as string[],
  // A PATCH waits for this before it is answered.
  patchGate: Promise.resolve() as Promise<void>,
  // Status codes to answer, in order, per method (204/201 once used up).
  statuses: {} as Record<string, number[]>,
  // Runs right after the upload's start() returns.
  afterStart: undefined as (() => void) | undefined
}));

// The token answer; a legacy backend sends no permlink or embed URL.
const token = vi.hoisted(() => ({ legacy: false }));

// What the fake server holds of the current upload: length and stored bytes.
const server = vi.hoisted(() => ({ length: 0, stored: 0 }));

// Vitest resolves the package's node entry; the app bundles its browser one,
// which is the build that reads a File.
vi.mock("tus-js-client", async () => {
  const real = (await import(
    // @ts-expect-error -- the browser build ships without its own typings
    "tus-js-client/lib.esm/browser/index.js"
  )) as typeof import("tus-js-client");
  let created = 0;
  const httpStack = {
    getName: () => "fake",
    createRequest(method: string, url: string) {
      const headers: Record<string, string> = {};
      net.opened.push(method);
      return {
        getMethod: () => method,
        getURL: () => url,
        setHeader: (k: string, v: string) => (headers[k] = v),
        getHeader: (k: string) => headers[k],
        setProgressHandler() {},
        abort: async () => {},
        getUnderlyingObject: () => null,
        async send(body?: Blob | null) {
          net.sent.push(method);
          if (method === "PATCH") await net.patchGate;
          created += method === "POST" ? 1 : 0;
          const status =
            net.statuses[method]?.shift() ??
            (method === "POST" ? 201 : method === "HEAD" ? 200 : 204);
          if (method === "POST") {
            server.length = Number(headers["Upload-Length"] ?? 0);
            server.stored = 0;
          }
          // A successful PATCH is stored in full, so the offset moves on.
          if (method === "PATCH" && status === 204) {
            server.stored = Number(headers["Upload-Offset"] ?? 0) + (body?.size ?? 0);
          }
          return {
            getStatus: () => status,
            getHeader: (k: string) =>
              k === "Location"
                ? `/uploads/u${created}`
                : k === "Upload-Offset"
                  ? String(server.stored)
                  : k === "Upload-Length"
                    ? String(server.length)
                    : null,
            getBody: () => "",
            getUnderlyingObject: () => null
          };
        }
      };
    }
  };
  class Upload extends real.Upload {
    constructor(file: File, options: ConstructorParameters<typeof real.Upload>[1]) {
      super(file, { ...options, httpStack, fingerprint: async () => null } as typeof options);
    }
    start() {
      super.start();
      net.afterStart?.();
    }
  }
  return { ...real, Upload };
});

import { uploadVideoEmbed } from "@/api/threespeak-embed/api";

const MB = 1024 * 1024;
const file = (size: number) => new File([new Uint8Array(size)], "clip.mp4", { type: "video/mp4" });

describe("aborting a 3Speak upload with the real tus client", () => {
  beforeEach(() => {
    net.sent = [];
    net.opened = [];
    net.patchGate = Promise.resolve();
    net.afterStart = undefined;
    net.statuses = {};
    token.legacy = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          token: "tok",
          upload_url: "https://embed.example/uploads",
          ...(token.legacy
            ? {}
            : { permlink: "TOK12345", embed_url: "https://play.3speak.tv/embed?v=alice/TOK12345" })
        })
      }))
    );
  });

  it.each([
    // One upload, or three parts: each opens its create request once.
    ["sequential", 1 * MB, 1, false],
    ["parallel", 11 * MB, 3, false],
    ["legacy header path", 11 * MB, 1, true]
  ])("an abort during start-up sends nothing and is not retried (%s)", async (_name, size, uploads, legacy) => {
    token.legacy = legacy;
    const controller = new AbortController();
    // The dialog closes the moment the upload starts: tus is still setting up.
    net.afterStart = () => controller.abort();
    const upload = uploadVideoEmbed(file(size), "alice", false, () => {}, controller.signal);

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    // tus's first retry delay is 0 s: a retried refusal opens a second request.
    await new Promise((r) => setTimeout(r, 50));
    expect(net.sent.filter((m) => m !== "DELETE")).toEqual([]);
    expect(net.opened.filter((m) => m !== "DELETE").length).toBeLessThanOrEqual(uploads);
  });

  it("an abort mid-upload deletes the created upload and sends nothing else", async () => {
    let release: () => void = () => {};
    // Hold the first PATCH in flight: the upload exists on the server.
    net.patchGate = new Promise((r) => (release = r));
    const controller = new AbortController();
    // 8 MB in 5 MB chunks: a second PATCH would follow the held one.
    const upload = uploadVideoEmbed(file(8 * MB), "alice", false, () => {}, controller.signal);
    await vi.waitFor(() => expect(net.sent).toEqual(["POST", "PATCH"]));
    const before = net.sent.length;

    controller.abort();
    release();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(net.sent.slice(before)).toEqual(["DELETE"]));
    // And nothing after it, such as the next chunk.
    await new Promise((r) => setTimeout(r, 50));
    expect(net.sent.slice(before)).toEqual(["DELETE"]);
  });

  it("after an abort, a failed DELETE is still retried", async () => {
    let release: () => void = () => {};
    net.patchGate = new Promise((r) => (release = r));
    net.statuses = { DELETE: [500, 204] };
    const controller = new AbortController();
    const upload = uploadVideoEmbed(file(1 * MB), "alice", false, () => {}, controller.signal);
    await vi.waitFor(() => expect(net.sent).toEqual(["POST", "PATCH"]));

    controller.abort();
    release();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(net.sent.filter((m) => m === "DELETE")).toHaveLength(2));
  });

  it("an upload that is not aborted still retries a failed chunk and finishes", async () => {
    net.statuses = { PATCH: [500] };

    await expect(
      uploadVideoEmbed(file(1 * MB), "alice", false, () => {}, new AbortController().signal)
    ).resolves.toMatchObject({ permlink: "TOK12345" });
    expect(net.sent.filter((m) => m === "PATCH").length).toBeGreaterThanOrEqual(2);
  });
});
