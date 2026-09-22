import { NextRequest } from "next/server";
import {
  ALLOWED_EXT,
  buildAudioResponse,
  CodedError,
  isPrivateIP,
  isValidAuthor,
  isValidPermlink,
  parseSpeakSource
} from "./_utils";
// React-free SDK entry: this server route only needs a raw bridge RPC, not the
// full @ecency/sdk (react-query). @ecency/sdk/hive ships just the tx/RPC engine.
import { callRPC } from "@ecency/sdk/hive";
import { isTakenDownPost } from "@/core/dmca-posts";
import { Resolver } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import { Agent } from "undici";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Node runtime: needs child_process (ffmpeg), node:dns and undici dispatcher
// pinning. Force-dynamic so Next never tries to statically cache the handler —
// edge caching is governed entirely by the response Cache-Control below.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------------
// /api/speak-audio?author=<a>&permlink=<p>
//
// Liketu "Speak" voice posts store their audio as Opus-in-WebM on cdn.liketu.com.
// Browsers (and Android/ExoPlayer) play that natively, but iOS AVPlayer — what
// react-native-video and Safari use — cannot demux WebM or decode Opus. This
// endpoint transcodes the clip to AAC/m4a so every client can play it.
//
// The clip URL is NOT taken from the request: the endpoint looks the wave up on
// chain (getPost) and reads json_metadata.speak.audio_url, then validates it is a
// cdn.liketu.com /liketu/ media file. So the fetch target is derived from trusted
// on-chain data rather than a user-supplied URL.
//
// The audio is immutable (content-addressed), so the response is immutable +
// long-TTL: Cloudflare edge-caches each clip and the origin only transcodes on a
// cache miss (a handful per day at Speak's volume).
// -----------------------------------------------------------------------------


const LOOKUP_TIMEOUT_MS = 8_000;
// A lagging Hive node can briefly return null for a freshly-posted wave; retry a
// couple of times with a short backoff before concluding the clip is absent.
const POST_LOOKUP_RETRIES = 2;
const LOOKUP_RETRY_DELAY_MS = 350;
const FETCH_TIMEOUT_MS = 15_000;
const FFMPEG_TIMEOUT_MS = 30_000;
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25MB — voice clips are well under 1MB
const MAX_OUTPUT_BYTES = 30 * 1024 * 1024;

// Bound concurrent source downloads (memory + connections) separately from ffmpeg
// (CPU): a slow download must not hold a CPU slot, and a cache-miss burst must not
// buffer unbounded input. Excess on either gate gets a short 503 + Retry-After; CF
// and the client retry, and by then the cache is usually warm.
const MAX_CONCURRENT_FETCHES = 8;
let activeFetches = 0;
const MAX_CONCURRENT_TRANSCODES = 4;
let activeTranscodes = 0;


function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolve the (already host-allowlisted) hostname, reject if any record is
 * private/reserved, and return an undici dispatcher pinned to the validated IP.
 * Pinning closes the DNS-rebinding TOCTOU window between resolution and connect;
 * the original hostname rides on the request so TLS SNI/cert checks still verify
 * against cdn.liketu.com. Mirrors apps/web/src/app/api/import/route.ts.
 */
async function resolveAndPin(hostname: string): Promise<Agent> {
  const resolver = new Resolver();
  const [v4, v6] = await Promise.all([
    resolver.resolve4(hostname).catch(() => [] as string[]),
    resolver.resolve6(hostname).catch(() => [] as string[])
  ]);
  const all = [...v4, ...v6];
  if (all.length === 0) {
    throw new CodedError("FETCH_FAILED", 502);
  }
  for (const ip of all) {
    if (isPrivateIP(ip)) {
      throw new CodedError("HOST_NOT_ALLOWED", 400);
    }
  }
  const pinned = v4[0] ?? v6[0];
  const family: 4 | 6 = v4.length > 0 ? 4 : 6;
  // undici 6.x calls the connector's lookup with `{ all: true }` on some paths
  // (expecting an array of { address, family }) and the classic
  // (err, address, family) callback on others. Honour the pinned IP for both
  // shapes — returning the wrong one trips undici's ERR_INVALID_IP_ADDRESS.
  const lookup: LookupFunction = (_hostname, options, cb) => {
    if ((options as { all?: boolean })?.all) {
      (cb as (e: null, a: { address: string; family: number }[]) => void)(null, [
        { address: pinned, family }
      ]);
    } else {
      cb(null, pinned, family);
    }
  };
  return new Agent({ connect: { lookup } });
}

/** Download the source audio with the pinned dispatcher, timeout and size cap. */
async function fetchAudio(url: URL): Promise<Buffer> {
  // parseSpeakSource already validated the host is exactly cdn.liketu.com, so fetch
  // the validated URL as-is. Do NOT rebuild it from url.pathname against a base — a
  // pathname like "//evil.com/x" makes `new URL(path, base)` adopt evil.com as the
  // host. Fetching the original URL keeps the request on the validated host (the
  // odd path is just a 404 on cdn.liketu.com).
  const dispatcher = await resolveAndPin(url.hostname);
  try {
    const res = await fetch(url, {
      redirect: "error", // a content-addressed CDN file should never redirect
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      ...({ dispatcher } as { dispatcher: Agent })
    } as RequestInit);

    if (!res.ok || !res.body) {
      throw new CodedError("FETCH_FAILED", 502);
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_INPUT_BYTES) {
        await reader.cancel();
        throw new CodedError("INPUT_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    void dispatcher.close().catch(() => {});
  }
}

/** Transcode webm/opus (or any input) -> AAC/m4a with a progressive (faststart) moov. */
async function transcodeToAac(input: Buffer, ext: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "speak-"));
  const inPath = join(dir, `input${ext}`);
  const outPath = join(dir, "output.m4a");
  try {
    await writeFile(inPath, input);
    await new Promise<void>((resolve, reject) => {
      execFile(
        "ffmpeg",
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          inPath,
          "-vn", // drop any video stream; Speak clips are audio-only
          "-c:a",
          "aac",
          "-b:a",
          "96k", // voice-grade; plenty for a transcript-backed voice note
          "-movflags",
          "+faststart", // moov before mdat -> progressive playback over HTTP
          "-f",
          "mp4",
          "-y",
          outPath
        ],
        { timeout: FFMPEG_TIMEOUT_MS, killSignal: "SIGKILL" },
        (err) => (err ? reject(new CodedError("TRANSCODE_FAILED", 502)) : resolve())
      );
    });
    // Only reached when ffmpeg exited 0. Still verify the output is a real MP4
    // (the `ftyp` box sits at the start) so a truncated/partial file from an
    // edge-case exit can never be served — and cached — as valid audio.
    const out = await readFile(outPath);
    const looksLikeMp4 = out.subarray(0, 16).includes(Buffer.from("ftyp"));
    if (out.byteLength === 0 || out.byteLength > MAX_OUTPUT_BYTES || !looksLikeMp4) {
      throw new CodedError("TRANSCODE_FAILED", 502);
    }
    return out;
  } finally {
    void rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function jsonError(code: string, status: number, extra?: Record<string, string>): Response {
  // Errors must never be cached — a cached 503 BUSY or 4xx would outlive its cause.
  return Response.json(
    { error: code },
    { status, headers: { "Cache-Control": "no-store", ...extra } }
  );
}

export async function GET(request: NextRequest) {
  const author = request.nextUrl.searchParams.get("author");
  const permlink = request.nextUrl.searchParams.get("permlink");
  if (!isValidAuthor(author) || !isValidPermlink(permlink)) {
    return jsonError("INVALID_REF", 400);
  }

  // A takedown covers the post's media too, and this route proxies it from our
  // own origin under a long-lived immutable cache key. It reads the chain
  // directly through the React-free hive entry, so the SDK's query filters
  // never see it and loading CONFIG here would not help: check the list
  // itself (#1862).
  if (isTakenDownPost(author, permlink)) {
    return jsonError("NOT_SPEAK", 404);
  }

  // Derive the audio URL from the on-chain post (trusted lookup), NOT from a
  // request parameter, so the eventual fetch target is never directly user-
  // controlled. The looked-up URL is still validated as a cdn.liketu.com /liketu/
  // media file before anything is fetched.
  let url: URL;
  try {
    // The wave came from the feed, so it exists on chain. Retry a null result a
    // couple of times (a lagging node can momentarily miss a fresh post) before
    // concluding it's absent; the NOT_SPEAK 404 below is no-store, so it's
    // transient either way.
    let post: { json_metadata?: unknown } | null = null;
    for (let attempt = 0; attempt <= POST_LOOKUP_RETRIES; attempt++) {
      post = await callRPC<{ json_metadata?: unknown } | null>(
        "bridge.get_post",
        { author, permlink, observer: "" },
        LOOKUP_TIMEOUT_MS
      );
      if (post) break;
      if (attempt < POST_LOOKUP_RETRIES) await delay(LOOKUP_RETRY_DELAY_MS);
    }
    if (!post) {
      return jsonError("NOT_SPEAK", 404);
    }
    // bridge.get_post usually returns json_metadata already parsed, but tolerate a
    // raw JSON string too.
    const raw = post.json_metadata;
    const meta = (typeof raw === "string" ? safeJsonParse(raw) : raw) as
      | { speak?: { audio_url?: string } }
      | null
      | undefined;
    const audioUrl = meta?.speak?.audio_url;
    if (!audioUrl) {
      return jsonError("NOT_SPEAK", 404);
    }
    url = parseSpeakSource(audioUrl);
  } catch (e) {
    const coded = e instanceof CodedError ? e : null;
    // CodedError => the on-chain URL failed host/path/ext validation; anything
    // else => the bridge lookup itself failed. Never leak a stray errno.
    return coded ? jsonError(coded.code, coded.status) : jsonError("LOOKUP_FAILED", 502);
  }

  try {
    // Bound downloads and transcodes on separate gates (see the constants above):
    // the fetch is I/O (memory/connections), ffmpeg is CPU. Capping only one lets
    // the other be exhausted, which is exactly what two earlier review rounds hit.
    if (activeFetches >= MAX_CONCURRENT_FETCHES) {
      return jsonError("BUSY", 503, { "Retry-After": "2" });
    }
    activeFetches += 1;
    let input: Buffer;
    try {
      input = await fetchAudio(url);
    } finally {
      activeFetches -= 1;
    }
    const ext = (url.pathname.match(ALLOWED_EXT)?.[0] ?? ".webm").toLowerCase();

    if (activeTranscodes >= MAX_CONCURRENT_TRANSCODES) {
      return jsonError("BUSY", 503, { "Retry-After": "2" });
    }
    activeTranscodes += 1;
    let output: Buffer;
    try {
      output = await transcodeToAac(input, ext);
    } finally {
      activeTranscodes -= 1;
    }

    return buildAudioResponse(output, request.headers.get("range"));
  } catch (e) {
    // Only trust code/status from our own CodedError; a stray Node error (e.g. a
    // filesystem errno from the temp-file dance) must not leak as the client code.
    const coded = e instanceof CodedError ? e : null;
    const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    const code = isTimeout ? "FETCH_TIMEOUT" : (coded?.code ?? "TRANSCODE_FAILED");
    const status = isTimeout ? 504 : (coded?.status ?? 502);
    return jsonError(code, status);
  }
}
