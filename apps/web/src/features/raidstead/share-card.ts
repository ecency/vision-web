import { drawShareCard, type ShareCard } from "@ecency/raidstead";
import { uploadImage } from "@ecency/sdk";
import { withUploadRetry } from "@/api/sdk-mutations/upload-image-retry";
import { ensureValidToken } from "@/utils/user-token";

/// How long the player waits for the card, all of it (drawing, the login token,
/// the upload), before the draft opens without it.
export const CARD_WAIT_MS = 15_000;

/// Draws the raid report's share card and uploads it to the image server as
/// `username`, the way the composer uploads (one automatic retry on a server
/// hiccup, no Retry prompt). Resolves the image URL, or null when anything
/// fails, the card could not be drawn, or it all takes longer than CARD_WAIT_MS:
/// the draft then opens without the card. `signal`: the caller no longer wants
/// it (the player closed the report).
export function shareCardImage(
  card: ShareCard,
  username: string,
  signal?: AbortSignal
): Promise<string | null> {
  const abort = new AbortController();
  const stop = () => abort.abort();
  signal?.addEventListener("abort", stop, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  // whatever is still pending (a token that never comes) loses to the clock or the caller
  const given = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      stop();
      resolve(null);
    }, CARD_WAIT_MS);
    abort.signal.addEventListener("abort", () => resolve(null), { once: true });
  });
  // a caller that gave up before this began gets nothing drawn or sent
  if (signal?.aborted) stop();
  const work = (async (): Promise<string | null> => {
    const canvas = document.createElement("canvas");
    // no 2D canvas: no picture, and a blank one is not uploaded
    if (!drawShareCard(canvas, card)) return null;
    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, "image/png");
      } catch {
        resolve(null);
      }
    });
    if (!blob || abort.signal.aborted) return null;
    const file = new File([blob], "raidstead-report.png", { type: "image/png" });
    const upload = async () => {
      const token = await ensureValidToken(username);
      if (!token) throw new Error("Token missed");
      if (abort.signal.aborted) throw new Error("Aborted");
      return uploadImage(file, token, abort.signal);
    };
    const { url } = await withUploadRetry(upload, abort.signal);
    return typeof url === "string" && url ? url : null;
  })().catch(() => null);
  return Promise.race([work, given]).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  });
}
