/**
 * Downloads an image to a file. Cross-origin `download` attributes are ignored by
 * browsers, so the bytes are fetched as a blob first; when even that fails (CORS,
 * network) fall back to opening the image so the user can still save it manually.
 */
export async function downloadImage(url: string, filename = "ai-generated"): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`download failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const ext = blob.type.split("/")[1]?.split("+")[0] || "webp";
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${filename}.${ext}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank");
  }
}
