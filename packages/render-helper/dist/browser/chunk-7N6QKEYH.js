import { canonicalEmbedSrc, isAllowedEmbedSrc } from './chunk-MYDFHHMT.js';
import { YOUTUBE_EMBED_REGEX, BITCHUTE_REGEX, VIMEO_EMBED_REGEX, TWITCH_EMBED_REGEX, SPEAK_EMBED_REGEX, SPEAK_AUDIO_EMBED_REGEX, SPOTIFY_EMBED_REGEX, SOUNDCLOUD_EMBED_REGEX, D_TUBE_EMBED_REGEX, VIMM_EMBED_REGEX, DAPPLR_REGEX, TRUVVL_REGEX, LBRY_REGEX, ODYSEE_REGEX, SKATEHIVE_IPFS_REGEX, SKATEHYPE_EMBED_REGEX, ARCH_REGEX, RUMBLE_REGEX, BRIGHTEON_REGEX, BRAND_NEW_TUBE_REGEX, LOOM_EMBED_REGEX, AUREAL_EMBED_REGEX } from './chunk-5HL7IVFO.js';
import { stripQueryString } from './chunk-6SZO54KO.js';

// src/methods/iframe.method.ts
function iframe(el, parentDomain = "ecency.com", forApp = false, renderOptions) {
  if (!el || !el.parentNode) {
    return;
  }
  const src = trimAsciiWhitespace(el.getAttribute("src") || "");
  if (!src) {
    el.parentNode.removeChild(el);
    return;
  }
  const supported = applyProvider(el, src, parentDomain, forApp, renderOptions);
  if (!el.parentNode) {
    return;
  }
  if (supported) {
    const finalSrc = canonicalEmbedSrc(el.getAttribute("src") || "");
    if (isAllowedEmbedSrc(finalSrc)) {
      el.setAttribute("src", finalSrc);
      return;
    }
  }
  const replaceNode = el.ownerDocument.createElement("div");
  replaceNode.setAttribute("class", "unsupported-iframe");
  replaceNode.textContent = `(Unsupported ${src})`;
  el.parentNode.insertBefore(replaceNode, el);
  el.parentNode.removeChild(el);
}
var isAsciiWhitespace = (c) => c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
function trimAsciiWhitespace(value) {
  let start = 0;
  let end = value.length;
  while (start < end && isAsciiWhitespace(value.charCodeAt(start))) start++;
  while (end > start && isAsciiWhitespace(value.charCodeAt(end - 1))) end--;
  return value.slice(start, end);
}
function applyProvider(el, src, parentDomain, forApp, renderOptions) {
  if (!el.parentNode) {
    return false;
  }
  const ytMatch = src.match(YOUTUBE_EMBED_REGEX);
  if (ytMatch) {
    let stripped = stripQueryString(src);
    if (!/^(https?:)?\/\/www\./i.test(stripped)) {
      stripped = stripped.replace(/^(https?:)?\/\/(?:m\.)?youtube\.com/i, "https://www.youtube.com");
    }
    stripped = stripped.replace(/^((?:https?:)?\/\/[^/]+)\/embed\//i, "$1/embed/");
    el.setAttribute("src", stripped);
    if (ytMatch[2].toLowerCase() === "shorts") {
      const shortId = stripped.match(/\/shorts\/([A-Za-z0-9_-]{11})\/?(?=[?#]|$)/i);
      if (!shortId) {
        return false;
      }
      el.setAttribute("src", `https://www.youtube.com/embed/${shortId[1]}`);
      el.setAttribute("class", "portrait-embed");
    }
    return true;
  }
  const bcMatch = src.match(BITCHUTE_REGEX);
  if (bcMatch) {
    el.setAttribute("src", `https://www.bitchute.com/embed/${bcMatch[1]}/`);
    return true;
  }
  const m = src.match(VIMEO_EMBED_REGEX);
  if (m && m.length === 2) {
    const s = `https://player.vimeo.com/video/${m[1]}`;
    el.setAttribute("src", s);
    return true;
  }
  if (src.match(TWITCH_EMBED_REGEX)) {
    let s = src;
    if (!s.includes("parent=")) {
      const separator = s.includes("?") ? "&" : "?";
      s = `${s}${separator}parent=${parentDomain}`;
    }
    if (!s.includes("autoplay=")) {
      const separator = s.includes("?") ? "&" : "?";
      s = `${s}${separator}autoplay=false`;
    }
    el.setAttribute("src", s);
    return true;
  }
  if (src.match(SPEAK_EMBED_REGEX)) {
    let normalizedSrc = src.replace(/(?:play\.)?3speak\.[a-z]+/i, "play.3speak.tv");
    normalizedSrc = normalizedSrc.replace(/\/embed\?/, "/watch?");
    const hasMode = /[?&]mode=/.test(normalizedSrc);
    if (!hasMode) {
      normalizedSrc = `${normalizedSrc}&mode=iframe`;
    }
    const hasAutoplay = /[?&]autoplay=/.test(normalizedSrc);
    let s;
    if (renderOptions?.embedVideosDirectly) {
      s = hasAutoplay ? normalizedSrc.replace(/([?&]autoplay=)[^&]*/i, "$1false") : `${normalizedSrc}&autoplay=false`;
    } else {
      s = hasAutoplay ? normalizedSrc : `${normalizedSrc}&autoplay=true`;
    }
    if (forApp && !/[?&]layout=/.test(s)) {
      s = `${s}&layout=mobile`;
    }
    el.setAttribute("src", s);
    el.setAttribute("class", "speak-iframe");
    return true;
  }
  if (src.match(SPEAK_AUDIO_EMBED_REGEX)) {
    let normalizedSrc = src;
    if (!/[?&]iframe=/.test(normalizedSrc)) {
      normalizedSrc = `${normalizedSrc}&iframe=1`;
    }
    if (!/[?&]mode=/.test(normalizedSrc)) {
      normalizedSrc = `${normalizedSrc}&mode=compact`;
    }
    el.setAttribute("src", normalizedSrc);
    el.setAttribute("class", "speak-audio-iframe");
    el.setAttribute("frameborder", "0");
    el.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    return true;
  }
  if (src.match(SPOTIFY_EMBED_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    el.setAttribute("frameborder", "0");
    return true;
  }
  if (src.match(SOUNDCLOUD_EMBED_REGEX)) {
    const match = src.match(/url=(.+?)(?:&|$)/);
    if (match && match[1]) {
      const s = `https://w.soundcloud.com/player/?url=${match[1]}&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&visual=true`;
      el.setAttribute("src", s);
    }
    return true;
  }
  if (src.match(D_TUBE_EMBED_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("sandbox", "allow-scripts allow-same-origin");
    el.setAttribute("frameborder", "0");
    el.setAttribute("allowfullscreen", "true");
    return true;
  }
  if (src.match(VIMM_EMBED_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    el.setAttribute("frameborder", "0");
    el.setAttribute("allowfullscreen", "true");
    return true;
  }
  if (src.match(DAPPLR_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("sandbox", "allow-scripts allow-same-origin");
    el.setAttribute("frameborder", "0");
    el.setAttribute("allowfullscreen", "true");
    return true;
  }
  if (src.match(TRUVVL_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    el.setAttribute("frameborder", "0");
    el.setAttribute("class", "portrait-embed");
    el.setAttribute("allowfullscreen", "true");
    return true;
  }
  if (src.match(LBRY_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("frameborder", "0");
    return true;
  }
  if (src.match(ODYSEE_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("frameborder", "0");
    return true;
  }
  if (src.match(SKATEHIVE_IPFS_REGEX)) {
    const video = el.ownerDocument.createElement("video");
    video.setAttribute("src", src);
    video.setAttribute("controls", "");
    el.parentNode.insertBefore(video, el);
    el.parentNode.removeChild(el);
    return true;
  }
  if (src.match(SKATEHYPE_EMBED_REGEX)) {
    const normalizedSrc = src.replace(/^(https?:)?\/\//i, "https://");
    el.setAttribute("src", normalizedSrc);
    el.setAttribute("frameborder", "0");
    el.setAttribute("allowfullscreen", "true");
    return true;
  }
  if (src.match(ARCH_REGEX)) {
    el.setAttribute("src", src);
    return true;
  }
  if (src.match(RUMBLE_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("frameborder", "0");
    return true;
  }
  const bnMatch = src.match(BRIGHTEON_REGEX);
  if (bnMatch) {
    el.setAttribute("src", `https://www.brighteon.com/embed/${bnMatch[2]}`);
    el.setAttribute("frameborder", "0");
    return true;
  }
  if (src.match(BRAND_NEW_TUBE_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("frameborder", "0");
    return true;
  }
  if (src.match(LOOM_EMBED_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("frameborder", "0");
    return true;
  }
  if (src.match(AUREAL_EMBED_REGEX)) {
    const normalizedSrc = src.startsWith("//") ? `https:${src}` : src;
    el.setAttribute("src", normalizedSrc);
    el.setAttribute("frameborder", "0");
    return true;
  }
  return false;
}

export { iframe };
//# sourceMappingURL=chunk-7N6QKEYH.js.map
//# sourceMappingURL=chunk-7N6QKEYH.js.map