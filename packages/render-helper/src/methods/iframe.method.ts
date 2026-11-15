import { isAllowedEmbedSrc, ARCH_REGEX, DAPPLR_REGEX, LBRY_REGEX, TRUVVL_REGEX, ODYSEE_REGEX, SKATEHIVE_IPFS_REGEX, SKATEHYPE_EMBED_REGEX, BITCHUTE_REGEX, RUMBLE_REGEX, BRIGHTEON_REGEX, VIMEO_EMBED_REGEX, SPEAK_EMBED_REGEX, SPEAK_AUDIO_EMBED_REGEX, VIMM_EMBED_REGEX, D_TUBE_EMBED_REGEX, SPOTIFY_EMBED_REGEX, SOUNDCLOUD_EMBED_REGEX, TWITCH_EMBED_REGEX, YOUTUBE_EMBED_REGEX, BRAND_NEW_TUBE_REGEX, LOOM_EMBED_REGEX, AUREAL_EMBED_REGEX } from '../consts'
import { stripQueryString } from '../helper'
import { RenderOptions } from '../types'

// Upgrade http:// and protocol-relative //host to https://. Every provider
// below serves its player over https, and the allow list only accepts https.
const toHttps = (src: string): string => src.replace(/^(?:https?:)?\/\//i, 'https://');

export function iframe(el: HTMLElement | null, parentDomain: string = 'ecency.com', forApp: boolean = false, renderOptions?: RenderOptions): void {
  if (!el || !el.parentNode) {
    return;
  }
  const src = el.getAttribute('src');
  if (!src) {
    el.parentNode.removeChild(el);
    return;
  }

  const supported = applyProvider(el, src, parentDomain, forApp, renderOptions);
  // Skatehive swaps the iframe for a <video>; nothing left to check.
  if (!el.parentNode) {
    return;
  }
  if (supported) {
    // The final sanitizer drops any iframe src that isAllowedEmbedSrc rejects
    // (#1919), so hold every provider branch to the same list here and show
    // the placeholder instead of an empty frame when they disagree.
    const finalSrc = toHttps(el.getAttribute('src') || '');
    if (isAllowedEmbedSrc(finalSrc)) {
      el.setAttribute('src', finalSrc);
      return;
    }
  }

  const replaceNode = el.ownerDocument.createElement('div');
  replaceNode.setAttribute('class', 'unsupported-iframe');
  replaceNode.textContent = `(Unsupported ${src})`;
  el.parentNode.insertBefore(replaceNode, el);
  el.parentNode.removeChild(el);
}

/** Normalises a known provider's iframe in place. False when no provider matched. */
function applyProvider(el: HTMLElement, src: string, parentDomain: string, forApp: boolean, renderOptions?: RenderOptions): boolean {
  if (!el.parentNode) {
    return false;
  }

  // Youtube
  const ytMatch = src.match(YOUTUBE_EMBED_REGEX);
  if (ytMatch) {
    // strip query string (yt: autoplay=1,controls=0,showinfo=0, etc)
    let stripped = stripQueryString(src);
    // youtube.com and m.youtube.com serve the same player; pin the host the
    // renderer emits everywhere else (m. is not on the embed allowlist).
    if (!/^(https?:)?\/\/www\./i.test(stripped)) {
      stripped = stripped.replace(/^(https?:)?\/\/(?:m\.)?youtube\.com/i, 'https://www.youtube.com');
    }
    // The route is matched case-insensitively above, but the player and the
    // allow list only know the lower case /embed/.
    stripped = stripped.replace(/^((?:https?:)?\/\/[^/]+)\/embed\//i, '$1/embed/');
    el.setAttribute('src', stripped);
    if (ytMatch[2].toLowerCase() === 'shorts') {
      // youtube.com/shorts/<id> refuses to be framed (X-Frame-Options), so
      // point the player at the embed route for the same id. A pasted iframe
      // has no wrapper anchor to carry the Shorts modifier, so mark the iframe
      // itself with the class Truvvl's 9:16 embeds already use.
      const shortId = stripped.match(/\/shorts\/([A-Za-z0-9_-]{11})\/?(?=[?#]|$)/i);
      if (!shortId) {
        // Not a video id, and the /shorts/ page itself cannot be framed.
        return false;
      }
      el.setAttribute('src', `https://www.youtube.com/embed/${shortId[1]}`);
      el.setAttribute('class', 'portrait-embed');
    }
    return true;
  }

  // BitChute: /video/<id> pages and /embed/<id> share the id; frame the embed
  // route, the same URL a.method.ts builds for a pasted link.
  const bcMatch = src.match(BITCHUTE_REGEX);
  if (bcMatch) {
    el.setAttribute('src', `https://www.bitchute.com/embed/${bcMatch[1]}/`);
    return true;
  }

  // Vimeo
  const m = src.match(VIMEO_EMBED_REGEX);
  if (m && m.length === 2) {
    const s = `https://player.vimeo.com/video/${m[1]}`;
    el.setAttribute('src', s);
    return true;
  }

  // Twitch
  if (src.match(TWITCH_EMBED_REGEX)) {
    let s = src;
    // Only add parent if not present
    if (!s.includes('parent=')) {
      const separator = s.includes('?') ? '&' : '?';
      s = `${s}${separator}parent=${parentDomain}`;
    }
    // Only add autoplay if not present
    if (!s.includes('autoplay=')) {
      const separator = s.includes('?') ? '&' : '?';
      s = `${s}${separator}autoplay=false`;
    }
    el.setAttribute('src', s);
    return true;
  }

  // 3Speak
  if (src.match(SPEAK_EMBED_REGEX)) {
    // Normalize domain to play.3speak.tv for new embed player
    // Use (?:play\.)? to avoid doubling the prefix on already-correct URLs
    let normalizedSrc = src.replace(/(?:play\.)?3speak\.[a-z]+/i, 'play.3speak.tv');

    // Normalize /embed? to /watch? for proper embed endpoint
    normalizedSrc = normalizedSrc.replace(/\/embed\?/, '/watch?');

    // Ensure mode=iframe parameter is present for minimal embed UI
    const hasMode = /[?&]mode=/.test(normalizedSrc);
    if (!hasMode) {
      normalizedSrc = `${normalizedSrc}&mode=iframe`;
    }

    // Waves/thread feeds embed inline (embedVideosDirectly) and must never
    // autoplay: force autoplay=false even when the src already carries
    // autoplay=true. Everywhere else, add autoplay=true only when absent so
    // an author-supplied value is preserved.
    const hasAutoplay = /[?&]autoplay=/.test(normalizedSrc);
    let s: string;
    if (renderOptions?.embedVideosDirectly) {
      s = hasAutoplay
        ? normalizedSrc.replace(/([?&]autoplay=)[^&]*/i, '$1false')
        : `${normalizedSrc}&autoplay=false`;
    } else {
      s = hasAutoplay ? normalizedSrc : `${normalizedSrc}&autoplay=true`;
    }

    // Add mobile layout parameter when rendering for app
    if (forApp && !/[?&]layout=/.test(s)) {
      s = `${s}&layout=mobile`;
    }

    el.setAttribute('src', s);
    el.setAttribute('class', 'speak-iframe');
    return true;
  }

  // 3Speak Audio
  if (src.match(SPEAK_AUDIO_EMBED_REGEX)) {
    let normalizedSrc = src;

    // Ensure iframe=1 parameter for clean embedding
    if (!/[?&]iframe=/.test(normalizedSrc)) {
      normalizedSrc = `${normalizedSrc}&iframe=1`;
    }

    // Default to compact mode if no mode specified
    if (!/[?&]mode=/.test(normalizedSrc)) {
      normalizedSrc = `${normalizedSrc}&mode=compact`;
    }

    el.setAttribute('src', normalizedSrc);
    el.setAttribute('class', 'speak-audio-iframe');
    el.setAttribute('frameborder', '0');
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    return true;
  }

  // Spotify
  if (src.match(SPOTIFY_EMBED_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    el.setAttribute('frameborder', '0');
    return true;
  }

  // Soundcloud
  if (src.match(SOUNDCLOUD_EMBED_REGEX)) {
    const match = src.match(/url=(.+?)(?:&|$)/); // Handle & or end of string
    if (match && match[1]) {
      const s = `https://w.soundcloud.com/player/?url=${match[1]}&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&visual=true`;
      el.setAttribute('src', s);
    }
    return true; // Always return, even if match fails
  }

  // Dtube
  if (src.match(D_TUBE_EMBED_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    el.setAttribute('frameborder', '0');
    el.setAttribute('allowfullscreen', 'true');
    return true;
  }

  // VIMM
  if (src.match(VIMM_EMBED_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    el.setAttribute('frameborder', '0');
    el.setAttribute('allowfullscreen', 'true');
    return true;
  }

  // Dapplr
  if (src.match(DAPPLR_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    el.setAttribute('frameborder', '0');
    el.setAttribute('allowfullscreen', 'true');
    return true;
  }

  // Truvvl
  if (src.match(TRUVVL_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    el.setAttribute('frameborder', '0');
    el.setAttribute('class', 'portrait-embed');
    el.setAttribute('allowfullscreen', 'true');
    return true;
  }

  // LBRY.tv
  if (src.match(LBRY_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('frameborder', '0');
    return true;
  }

  // ODYSEE
  if (src.match(ODYSEE_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('frameborder', '0');
    return true;
  }

  // IPFS Skatehive
  // The skatehive IPFS gateway serves the raw video file directly (content-type
  // video/mp4), so an <iframe src=…> loads a browser *media document*, which
  // Chrome autoplays on load regardless of the `allow` attribute. Render a real
  // <video controls> instead so playback is user-initiated and never autoplays
  // (the sanitizer keeps only src/controls/poster on <video>, so an autoplay
  // attribute could not survive here anyway). Same behaviour in waves and posts.
  if (src.match(SKATEHIVE_IPFS_REGEX)) {
    const video = el.ownerDocument.createElement('video');
    video.setAttribute('src', src);
    video.setAttribute('controls', '');
    el.parentNode.insertBefore(video, el);
    el.parentNode.removeChild(el);
    return true;
  }

  // Skatehype
  if (src.match(SKATEHYPE_EMBED_REGEX)) {
    // Force https:// for http:// and protocol-relative URLs so the embed
    // isn't blocked as mixed content on the https app.
    const normalizedSrc = src.replace(/^(https?:)?\/\//i, 'https://');
    el.setAttribute('src', normalizedSrc);
    el.setAttribute('frameborder', '0');
    el.setAttribute('allowfullscreen', 'true');
    return true;
  }

  // archive.org
  if (src.match(ARCH_REGEX)) {
    el.setAttribute('src', src);
    return true;
  }

  // Rumble
  if (src.match(RUMBLE_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('frameborder', '0');
    return true;
  }

  // Brighteon: a page URL frames as the embed route, as a.method.ts builds it.
  const bnMatch = src.match(BRIGHTEON_REGEX);
  if (bnMatch) {
    el.setAttribute('src', `https://www.brighteon.com/embed/${bnMatch[2]}`);
    el.setAttribute('frameborder', '0');
    return true;
  }

  // Brandnew Tube
  if (src.match(BRAND_NEW_TUBE_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('frameborder', '0');
    return true;
  }

  // Loom
  if (src.match(LOOM_EMBED_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('frameborder', '0');
    return true;
  }

  // Aureal
  if (src.match(AUREAL_EMBED_REGEX)) {
    // Normalize protocol-relative URLs to https://
    const normalizedSrc = src.startsWith('//') ? `https:${src}` : src;
    el.setAttribute('src', normalizedSrc);
    el.setAttribute('frameborder', '0');
    return true;
  }

  return false;
}
