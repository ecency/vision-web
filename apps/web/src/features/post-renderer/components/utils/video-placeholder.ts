/**
 * The click-to-play renderers hide the placeholder's thumbnail and play button
 * when the player opens. Those are nodes React does not own, so whoever tears a
 * player down shows them again, or a re-enhanced link would sit there with no
 * thumbnail and nothing to click (#2082).
 */
const PLACEHOLDER_PARTS = [".video-thumbnail", ".markdown-video-play"];

export function setVideoPlaceholderVisible(link: HTMLElement, visible: boolean): void {
  for (const selector of PLACEHOLDER_PARTS) {
    const part = link.querySelector<HTMLElement>(selector);
    if (part) part.style.display = visible ? "" : "none";
  }
}
