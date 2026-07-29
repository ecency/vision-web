import { useEffect } from 'react';

const THREE_SPEAK_EMBED_ORIGIN = 'https://play.3speak.tv';

export type SpeakOrientationClass = 'speak-portrait' | 'speak-square';

/**
 * Read the orientation out of a `3speak-player-ready` message, or null when the
 * message is not one (wrong origin, wrong type) or the clip is landscape and
 * the default 16:9 box is already right.
 */
export function resolveSpeakOrientationClass(
  event: Pick<MessageEvent, 'origin' | 'data'>,
): SpeakOrientationClass | null {
  if (
    event.origin !== THREE_SPEAK_EMBED_ORIGIN ||
    event.data?.type !== '3speak-player-ready'
  ) {
    return null;
  }

  if (event.data.isVertical) {
    return 'speak-portrait';
  }

  const { aspectRatio } = event.data;
  if (typeof aspectRatio === 'number' && Math.abs(aspectRatio - 1) < 0.1) {
    return 'speak-square';
  }

  return null;
}

/**
 * Post bodies here are rendered with `embedVideosDirectly`, so none of the web
 * app's client-side video enhancers run and every 3Speak embed sits in the
 * fixed 16:9 box from blog-markdown.css. A vertical (9:16) clip then plays
 * pillarboxed between two wide black bars.
 *
 * Once the player knows the real dimensions it reports them to the parent
 * window as `{ type: '3speak-player-ready', isVertical, aspectRatio }`. Turn
 * that into the `speak-portrait` / `speak-square` class the CSS overrides look
 * for, which is what `EcencyRenderer` does on ecency.com.
 *
 * A single document-level listener covers the post body and every comment body
 * at once: the message carries the source window, which is matched back to the
 * iframe that sent it.
 */
export function useThreeSpeakOrientation() {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Bail before touching any class for the player's other messages, so a
      // correct verdict is not cleared by an unrelated event.
      if (
        event.origin !== THREE_SPEAK_EMBED_ORIGIN ||
        event.data?.type !== '3speak-player-ready'
      ) {
        return;
      }

      const iframe = Array.from(
        document.querySelectorAll<HTMLIFrameElement>('iframe.speak-iframe'),
      ).find(
        (el) => el.contentWindow !== null && el.contentWindow === event.source,
      );
      const container = iframe?.closest('.markdown-video-link-speak');
      if (!container) {
        return;
      }

      // The player re-reports when the source changes, so drop any earlier
      // verdict instead of stacking classes.
      container.classList.remove('speak-portrait', 'speak-square');

      const orientation = resolveSpeakOrientationClass(event);
      if (orientation) {
        container.classList.add(orientation);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
}
