import { drawShareCard, type ShareCard } from "@ecency/raidstead";
import { uploadImage } from "@ecency/sdk";
import { withUploadRetry } from "@/api/sdk-mutations/upload-image-retry";
import { ensureValidToken } from "@/utils/user-token";

/// How long the player waits for the card before the draft opens without it.
export const CARD_WAIT_MS = 15_000;

/// Draws the raid report's share card and uploads it to the image server as
/// `username`, the way the composer uploads (one automatic retry on a server
/// hiccup, no Retry prompt). Resolves the image URL, or null when anything
/// fails or takes too long: the draft then opens without the card.
export async function shareCardImage(card: ShareCard, username: string): Promise<string | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CARD_WAIT_MS);
  try {
    const canvas = document.createElement("canvas");
    drawShareCard(canvas, card);
    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, "image/png");
      } catch {
        // a canvas that cannot be read back (no 2D support at all)
        resolve(null);
      }
    });
    if (!blob || abort.signal.aborted) return null;
    const file = new File([blob], "raidstead-report.png", { type: "image/png" });
    const upload = async () => {
      const token = await ensureValidToken(username);
      if (!token) throw new Error("Token missed");
      return uploadImage(file, token, abort.signal);
    };
    const { url } = await withUploadRetry(upload, abort.signal);
    return typeof url === "string" && url ? url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
