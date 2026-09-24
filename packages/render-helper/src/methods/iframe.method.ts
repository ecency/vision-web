import { ARCH_REGEX, DAPPLR_REGEX, LBRY_REGEX, TRUVVL_REGEX, ODYSEE_REGEX, SKATEHIVE_IPFS_REGEX, SKATEHYPE_EMBED_REGEX, BITCHUTE_REGEX, RUMBLE_REGEX, BRIGHTEON_REGEX, VIMEO_EMBED_REGEX, SPEAK_EMBED_REGEX, SPEAK_AUDIO_EMBED_REGEX, VIMM_EMBED_REGEX, D_TUBE_EMBED_REGEX, SPOTIFY_EMBED_REGEX, SOUNDCLOUD_EMBED_REGEX, TWITCH_EMBED_REGEX, YOUTUBE_EMBED_REGEX, BRAND_NEW_TUBE_REGEX, LOOM_EMBED_REGEX, AUREAL_EMBED_REGEX } from '../consts'
import { stripQueryString } from '../helper'
import { RenderOptions } from '../types'

export function iframe(el: HTMLElement | null, parentDomain: string = 'ecency.com', forApp: boolean = false, renderOptions?: RenderOptions): void {
  if (!el || !el.parentNode) {
    return;
  }
  const src = el.getAttribute('src');
  if (!src) {
    el.parentNode.removeChild(el);
    return;
  }

  // Youtube
  const ytMatch = src.match(YOUTUBE_EMBED_REGEX);
  if (ytMatch) {
    // strip query string (yt: autoplay=1,controls=0,showinfo=0, etc)
    el.setAttribute('src', stripQueryString(src));
    // A pasted iframe has no wrapper anchor to carry the Shorts modifier, so
    // mark the iframe itself with the class Truvvl's 9:16 embeds already use.
    if (ytMatch[2].toLowerCase() === 'shorts') {
      el.setAttribute('class', 'portrait-embed');
    }
    return;
  }

  if (src.match(BITCHUTE_REGEX)) {
    return;
  }

  // Vimeo
  const m = src.match(VIMEO_EMBED_REGEX);
  if (m && m.length === 2) {
    const s = `https://player.vimeo.com/video/${m[1]}`;
    el.setAttribute('src', s);
    return;
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
    return;
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
    return;
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
    return;
  }

  // Spotify
  if (src.match(SPOTIFY_EMBED_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    el.setAttribute('frameborder', '0');
    return;
  }

  // Soundcloud
  if (src.match(SOUNDCLOUD_EMBED_REGEX)) {
    const match = src.match(/url=(.+?)(?:&|$)/); // Handle & or end of string
    if (match && match[1]) {
      const s = `https://w.soundcloud.com/player/?url=${match[1]}&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&visual=true`;
      el.setAttribute('src', s);
    }
    return; // Always return, even if match fails
  }

  // Dtube
  if (src.match(D_TUBE_EMBED_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    el.setAttribute('frameborder', '0');
    el.setAttribute('allowfullscreen', 'true');
    return;
  }

  // VIMM
  if (src.match(VIMM_EMBED_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    el.setAttribute('frameborder', '0');
    el.setAttribute('allowfullscreen', 'true');
    return;
  }

  // Dapplr
  if (src.match(DAPPLR_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    el.setAttribute('frameborder', '0');
    el.setAttribute('allowfullscreen', 'true');
    return;
  }

  // Truvvl
  if (src.match(TRUVVL_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    el.setAttribute('frameborder', '0');
    el.setAttribute('class', 'portrait-embed');
    el.setAttribute('allowfullscreen', 'true');
    return;
  }

  // LBRY.tv
  if (src.match(LBRY_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('frameborder', '0');
    return;
  }

  // ODYSEE
  if (src.match(ODYSEE_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('frameborder', '0');
    return;
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
    return;
  }

  // Skatehype
  if (src.match(SKATEHYPE_EMBED_REGEX)) {
    // Force https:// for http:// and protocol-relative URLs so the embed
    // isn't blocked as mixed content on the https app.
    const normalizedSrc = src.replace(/^(https?:)?\/\//i, 'https://');
    el.setAttribute('src', normalizedSrc);
    el.setAttribute('frameborder', '0');
    el.setAttribute('allowfullscreen', 'true');
    return;
  }

  // archive.org
  if (src.match(ARCH_REGEX)) {
    el.setAttribute('src', src);
    return;
  }

  // Rumble
  if (src.match(RUMBLE_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('frameborder', '0');
    return;
  }

  // Brighteon
  if (src.match(BRIGHTEON_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('frameborder', '0');
    return;
  }

  // Brandnew Tube
  if (src.match(BRAND_NEW_TUBE_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('frameborder', '0');
    return;
  }

  // Loom
  if (src.match(LOOM_EMBED_REGEX)) {
    el.setAttribute('src', src);
    el.setAttribute('frameborder', '0');
    return;
  }

  // Aureal
  if (src.match(AUREAL_EMBED_REGEX)) {
    // Normalize protocol-relative URLs to https://
    const normalizedSrc = src.startsWith('//') ? `https:${src}` : src;
    el.setAttribute('src', normalizedSrc);
    el.setAttribute('frameborder', '0');
    return;
  }

  const replaceNode = el.ownerDocument.createElement('div');
  replaceNode.setAttribute('class', 'unsupported-iframe');
  replaceNode.textContent = `(Unsupported ${src})`;
  if (el.parentNode) {
    el.parentNode.insertBefore(replaceNode, el);
    el.parentNode.removeChild(el);
  }
}
