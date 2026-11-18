import { EcencyConfigManager } from "@/config";
import * as ls from "@/utils/local-storage";
import { ensureValidTokenWithin } from "@/utils/user-token";
import { VideoUploadResult, ThreeSpeakEmbedVideo } from "./types";

function getEmbedEndpoint(): string {
  return EcencyConfigManager.getConfigValue(
    ({ thirdPartyFeatures }) => thirdPartyFeatures.threeSpeak.uploading.embedEndpoint
  ) as string;
}

/**
 * Returns the active user's HiveSigner access token to send as `code` to the
 * 3Speak proxy routes. The server validates it against
 * https://hivesigner.com/api/me and refuses one past its lifetime, so an
 * expired token is renewed first, waiting a few seconds at most. If renewing
 * fails or stalls (a HiveSigner outage) the stored token goes as before,
 * rather than a hard "log in again" prompt.
 *
 * Throws an error with status 401 before any request in two cases: no active
 * user, or an active user with no stored token. A token the server refuses
 * comes back as its own 401; callers may surface either as a re-login prompt.
 */
async function getThreeSpeakAuthCode(): Promise<string> {
  const username = ls.get("active_user");
  if (!username) {
    const err = new Error("[3Speak] Not logged in");
    (err as any).status = 401;
    throw err;
  }
  const token = await ensureValidTokenWithin(username);
  if (!token) {
    const err = new Error("[3Speak] No HiveSigner token available, please log in again");
    (err as any).status = 401;
    throw err;
  }
  return token;
}

/**
 * Request a short-lived upload token from our backend proxy.
 * The server-side API key never reaches the browser.
 */
async function requestUploadToken(
  owner: string,
  isShort: boolean
): Promise<{ token: string; upload_url: string; permlink?: string; embed_url?: string }> {
  const code = await getThreeSpeakAuthCode();
  const response = await fetch("/api/threespeak/upload-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, isShort, code })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const err = new Error(`[3Speak Embed] Failed to get upload token: ${response.status} ${text}`);
    (err as any).status = response.status;
    throw err;
  }

  return response.json();
}

/**
 * Extract the permlink from an embed URL.
 * Handles formats like:
 *   https://play.3speak.tv/embed?v=user/abcd1234
 *   @user/abcd1234
 */
export function extractPermlink(embedUrl: string): string {
  // Try ?v=user/permlink format
  const vParam = embedUrl.match(/[?&]v=([^&]+)/);
  if (vParam?.[1]) {
    const parts = vParam[1].split("/");
    const permlink = parts[parts.length - 1];
    if (permlink) return permlink;
  }
  // Try @user/permlink format
  const atFormat = embedUrl.match(/@[^/]+\/([a-zA-Z0-9]+)/);
  if (atFormat?.[1]) {
    return atFormat[1];
  }
  // Last segment fallback — strip query params
  const lastSegment = embedUrl.split("/").pop() ?? "";
  return lastSegment.split("?")[0].split("#")[0];
}

const MB = 1024 * 1024;

/**
 * Choose chunk size and parallelism based on the file size.
 *
 * Parallel uploads use the TUS Concatenation extension (supported by the
 * 3Speak tusd backend): the file is split into N parts uploaded concurrently,
 * then stitched server-side. Small files skip parallelism — there is no
 * throughput gain and it avoids zero-length parts. Chunk size is kept modest
 * so peak in-flight memory stays around chunkSize × parallelUploads.
 */
export function getUploadTuning(size: number): { chunkSize: number; parallelUploads: number } {
  if (size <= 10 * MB) return { chunkSize: 5 * MB, parallelUploads: 1 };
  if (size <= 500 * MB) return { chunkSize: 10 * MB, parallelUploads: 3 };
  return { chunkSize: 20 * MB, parallelUploads: 3 };
}

/**
 * Upload a video file via the TUS resumable upload protocol.
 *
 * The upload token now carries the video's permlink and canonical embed URL
 * (assigned by the backend at issuance), so the result no longer depends on
 * reading an X-Embed-URL response header. This is what makes parallel (TUS
 * Concatenation) uploads reliable: previously, when the final-concat response
 * didn't surface that header, the client treated a *completed* upload as a
 * failure and re-uploaded the whole file, producing duplicate uploads.
 *
 * Against an older backend that doesn't return a permlink with the token, we
 * fall back to the proven sequential path and read the embed URL from the
 * header. Neither path ever re-uploads, so duplicates can't happen.
 */
export async function uploadVideoEmbed(
  file: File,
  owner: string,
  isShort: boolean,
  progressCallback: (percentage: number) => void
): Promise<VideoUploadResult> {
  const { token, upload_url, permlink, embed_url } = await requestUploadToken(owner, isShort);

  // Fall back to config endpoint if upload_url not provided
  const endpoint = upload_url || `${getEmbedEndpoint()}/uploads`;

  // Preferred path: the backend assigned the permlink/embed URL up front, so we
  // run a single upload (parallel for files > 10MB) and resolve with the known
  // URL on success — no header to capture, no re-upload.
  if (permlink && embed_url) {
    const { chunkSize, parallelUploads } = getUploadTuning(file.size);
    await runTusUpload(file, token, endpoint, chunkSize, parallelUploads, progressCallback);
    return { embedUrl: embed_url, permlink };
  }

  // Legacy backend: the embed URL only comes back via the X-Embed-URL header.
  // Use the sequential path — its single create→response keeps the header
  // reliable, and because it never re-uploads, a missing header surfaces as an
  // error instead of silently duplicating the upload.
  const { chunkSize } = getUploadTuning(file.size);
  return uploadFromHeader(file, token, endpoint, chunkSize, progressCallback);
}

const TUS_RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];

/**
 * Run a TUS upload to completion. Resolves on success, rejects on error.
 * Aborts in-flight parts on error so a failed parallel upload doesn't keep
 * pushing bytes in the background.
 */
async function runTusUpload(
  file: File,
  token: string,
  endpoint: string,
  chunkSize: number,
  parallelUploads: number,
  progressCallback: (percentage: number) => void
): Promise<void> {
  // Load TUS on demand: this module's playback helpers (getVideoMetadata,
  // extractPermlink, ...) are imported by the post renderer on read pages, and
  // a top-level import would drag the ~48 KB upload client onto every post.
  const tus = await import("tus-js-client");

  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      chunkSize,
      parallelUploads,
      retryDelays: TUS_RETRY_DELAYS,
      headers: { Authorization: `Bearer ${token}` },
      metadata: { filename: file.name },
      onError(error: Error) {
        upload.abort().catch(() => {});
        reject(error);
      },
      onProgress(bytesUploaded: number, bytesTotal: number) {
        progressCallback(Number(((bytesUploaded / bytesTotal) * 100).toFixed(2)));
      },
      onSuccess() {
        resolve();
      }
    });

    upload.start();
  });
}

/**
 * Legacy fallback for backends that don't return a permlink with the token.
 * Uploads sequentially (parallelUploads = 1) and reads the embed URL from the
 * X-Embed-URL header on the create response.
 */
async function uploadFromHeader(
  file: File,
  token: string,
  endpoint: string,
  chunkSize: number,
  progressCallback: (percentage: number) => void
): Promise<VideoUploadResult> {
  const tus = await import("tus-js-client");

  return new Promise<VideoUploadResult>((resolve, reject) => {
    let embedUrl = "";

    const upload = new tus.Upload(file, {
      endpoint,
      chunkSize,
      parallelUploads: 1,
      retryDelays: TUS_RETRY_DELAYS,
      headers: { Authorization: `Bearer ${token}` },
      metadata: { filename: file.name },
      onError(error: Error) {
        // Cancel any in-progress retry before rejecting, mirroring runTusUpload.
        upload.abort().catch(() => {});
        reject(error);
      },
      onProgress(bytesUploaded: number, bytesTotal: number) {
        progressCallback(Number(((bytesUploaded / bytesTotal) * 100).toFixed(2)));
      },
      onSuccess() {
        if (!embedUrl) {
          reject(new Error("[3Speak Embed] Upload succeeded but no embed URL was returned"));
          return;
        }
        const permlink = extractPermlink(embedUrl);
        if (!permlink) {
          reject(
            new Error("[3Speak Embed] Upload succeeded but the permlink could not be extracted")
          );
          return;
        }
        resolve({ embedUrl, permlink });
      },
      onAfterResponse(_req: any, res: any) {
        const headerUrl = res.getHeader?.("x-embed-url") || res.getHeader?.("X-Embed-URL");
        if (headerUrl) {
          embedUrl = headerUrl;
        }
      }
    });

    upload.start();
  });
}

/**
 * Get video metadata by permlink.
 * This endpoint is public on 3Speak (no API key needed).
 */
export async function getVideoMetadata(permlink: string): Promise<ThreeSpeakEmbedVideo> {
  const endpoint = getEmbedEndpoint();
  const response = await fetch(`${endpoint}/video/${permlink}`);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const err = new Error(`[3Speak Embed] Failed to get video metadata: ${response.status}`);
    (err as any).status = response.status;
    (err as any).responseText = text;
    throw err;
  }

  return response.json();
}

/**
 * Set a custom thumbnail for a video via our backend proxy.
 * The API key stays server-side.
 */
export async function setVideoThumbnail(permlink: string, thumbnailUrl: string): Promise<void> {
  const code = await getThreeSpeakAuthCode();
  const response = await fetch("/api/threespeak/thumbnail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permlink, thumbnail_url: thumbnailUrl, code })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const err = new Error(`[3Speak Embed] Failed to set thumbnail: ${response.status}`);
    (err as any).status = response.status;
    (err as any).responseText = text;
    throw err;
  }
}

/**
 * Links an uploaded video to a published Hive post/comment.
 * This enables the video to appear in 3Speak's special feeds (e.g. Shorts).
 *
 * Should be called after the Hive broadcast succeeds — fire-and-forget is fine
 * since this is a non-critical metadata update.
 */
export interface LinkVideoToHiveParams {
  /** Video permlink (from the embed URL, NOT the Hive post permlink) */
  videoPermlink: string;
  hiveAuthor: string;
  hivePermlink: string;
  hiveTitle?: string;
  hiveBody?: string;
  hiveTags?: string[];
}

export async function linkVideoToHive(params: LinkVideoToHiveParams): Promise<void> {
  try {
    const code = await getThreeSpeakAuthCode();
    const response = await fetch("/api/threespeak/link-hive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        permlink: params.videoPermlink,
        hive_author: params.hiveAuthor,
        hive_permlink: params.hivePermlink,
        hive_title: params.hiveTitle,
        hive_body: params.hiveBody,
        hive_tags: params.hiveTags,
        code
      })
    });

    if (!response.ok) {
      console.error(`[3Speak] Failed to link video to Hive: ${response.status}`);
    }
  } catch (e) {
    // Non-critical — video still works, just won't appear in 3Speak feeds
    console.error("[3Speak] linkVideoToHive error:", e);
  }
}
