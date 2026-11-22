import { removeChildNodes } from './chunk-VXSEAEHB.js';
import { activePlaceholderDelimiter } from './chunk-NJPAOL3G.js';
import { getSerializedInnerHTML } from './chunk-6JBQDGO4.js';
import { createImageHTML } from './chunk-TIHPKFVC.js';
import { markInternalThumbnail } from './chunk-NQZM6AV2.js';
import { SECTION_LIST } from './chunk-P5HRQG6E.js';
import { WHITE_LIST } from './chunk-UKFBJKIZ.js';
import { IMG_REGEX, IPFS_REGEX, POST_REGEX, MENTION_REGEX, INTERNAL_POST_TAG_REGEX, INTERNAL_MENTION_REGEX, INTERNAL_POST_REGEX, TOPIC_REGEX, INTERNAL_TOPIC_REGEX, CUSTOM_COMMUNITY_REGEX, CCC_REGEX, BITCHUTE_REGEX, RUMBLE_REGEX, BRIGHTEON_REGEX, ODYSEE_WATCH_REGEX, YOUTUBE_REGEX, VIMEO_REGEX, TWITCH_REGEX, SPOTIFY_REGEX, LOOM_REGEX, D_TUBE_REGEX, D_TUBE_REGEX2, SPEAK_REGEX, SPEAK_AUDIO_REGEX, LIKETU_AUDIO_REGEX, TWITTER_REGEX } from './chunk-5HL7IVFO.js';
import { proxifyImageSrc } from './chunk-6323QD2U.js';
import { DOMParser } from './chunk-DBKALPTB.js';
import { imageUrlEnd, sanitizePermlink, isValidPermlink, isValidUsername, youtubeVideoLinkClass, extractYtStartTime, stripHtmlTags, trimTrailingSlash } from './chunk-EHL62ZCR.js';

// src/methods/a.method.ts
var NOFOLLOW_REPUTATION_THRESHOLD = 40;
var FOLLOW_PAYOUT_THRESHOLD = 5;
function getExternalLinkRel(seoContext) {
  if (seoContext?.authorReputation !== void 0 && seoContext?.postPayout !== void 0 && seoContext.authorReputation >= NOFOLLOW_REPUTATION_THRESHOLD && seoContext.postPayout > FOLLOW_PAYOUT_THRESHOLD) {
    return "noopener";
  }
  return "nofollow ugc noopener";
}
function renderPlainVideoLink(el, provider, embedSrc, renderOptions) {
  const baseClass = `markdown-video-link markdown-video-link-${provider}`;
  el.setAttribute("class", baseClass);
  el.removeAttribute("href");
  el.textContent = "";
  el.setAttribute("data-embed-src", embedSrc);
  if (renderOptions?.embedVideosDirectly) {
    const wrapper = el.ownerDocument.createElement("span");
    wrapper.setAttribute("class", "er-embed-frame");
    wrapper.setAttribute("style", "display:block");
    const frame = el.ownerDocument.createElement("iframe");
    frame.setAttribute("src", embedSrc);
    frame.setAttribute("title", "Video player");
    frame.setAttribute(
      "allow",
      "accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
    );
    frame.setAttribute("allowfullscreen", "");
    wrapper.appendChild(frame);
    el.appendChild(wrapper);
    el.setAttribute("class", `${baseClass} er-embed`);
    return;
  }
  const play = el.ownerDocument.createElement("span");
  play.setAttribute("class", "markdown-video-play");
  el.appendChild(play);
}
var normalizeValue = (value) => value ? value.trim() : "";
var matchesHref = (href, value) => {
  const normalizedHref = normalizeValue(href);
  if (!normalizedHref) {
    return false;
  }
  return normalizeValue(value) === normalizedHref;
};
var normalizeDisplayText = (text) => {
  const beforeTrailingSlash = text.trim().replace(/^https?:\/\/(www\.)?(ecency\.com|peakd\.com|hive\.blog|leofinance\.io|inleo\.io|snapie\.io|hivesuite\.app)/i, "").replace(/^\/+/, "").split("?")[0].replace(/#@.*$/i, "");
  return trimTrailingSlash(beforeTrailingSlash).toLowerCase();
};
var getInlineMeta = (el, href, author, permlink, communityTag) => {
  const textMatches = matchesHref(href, el.textContent);
  const titleMatches = matchesHref(href, el.getAttribute("title"));
  const normalizedDisplay = normalizeDisplayText(el.textContent || "");
  const normalizedTarget = `@${author}/${permlink}`.toLowerCase();
  const expectedDisplays = /* @__PURE__ */ new Set([normalizedTarget]);
  if (communityTag) {
    expectedDisplays.add(`${communityTag.toLowerCase()}/${normalizedTarget}`);
  }
  const sophisticatedMatch = normalizedDisplay === normalizedTarget || (communityTag ? normalizedDisplay === `${communityTag.toLowerCase()}/${normalizedTarget}` : false);
  return {
    textMatches,
    titleMatches,
    isInline: textMatches || titleMatches || sophisticatedMatch
  };
};
var addLineBreakBeforePostLink = (el, forApp, isInline) => {
  if (forApp && isInline && el.parentNode) {
    const br = el.ownerDocument.createElement("br");
    el.parentNode.insertBefore(br, el);
  }
};
function isInSiteHref(href) {
  try {
    return WHITE_LIST.includes(new URL(href.trim(), "https://ecency.com/").hostname.replace(/^www\./, ""));
  } catch {
    return false;
  }
}
var CHIP_CLASS_TOKENS = /* @__PURE__ */ new Set(["markdown-author-link", "markdown-tag-link", "er-author", "er-author-link", "er-tag", "er-tag-link"]);
function a(el, forApp, parentDomain = "ecency.com", seoContext, renderOptions) {
  if (!el || !el.parentNode) {
    return;
  }
  let href = el.getAttribute("href");
  if (!href) {
    return;
  }
  const trimmed = href.trim().replace(/[\t\n\r\f\v\0]/g, "").toLowerCase();
  const isSafeScheme = /^(https?|mailto|hive|tel|web\+[a-z0-9.+-]+):/i.test(trimmed);
  const isRelative = /^(\/\/|\/[^/]?|#|\?|[a-z0-9._\-]+(\/|$))/i.test(trimmed);
  if (!isSafeScheme && !isRelative) {
    el.removeAttribute("href");
    return;
  }
  const className = el.getAttribute("class");
  const classTokens = (className || "").split(/\s+/);
  const isChip = classTokens.some((token) => CHIP_CLASS_TOKENS.has(token));
  if (isChip && isInSiteHref(href)) {
    el.removeAttribute("rel");
    if (el.getAttribute("target")) {
      el.setAttribute("rel", getExternalLinkRel(seoContext));
    }
    return;
  }
  let refusedImage = false;
  if (href.match(IMG_REGEX) && // Not `.ico` in `.icons/readme` nor `.jpg` in `photo.jpg.html` (imageUrlEnd).
  imageUrlEnd(href) !== -1 && href.trim().replace(/&amp;/g, "&") === getSerializedInnerHTML(el).trim().replace(/&amp;/g, "&")) {
    const isLCP = false;
    const imgHTML = createImageHTML(href, isLCP, forApp);
    refusedImage = !imgHTML;
    if (imgHTML) {
      const doc = DOMParser.parseFromString(imgHTML, "text/html");
      const replaceNode = doc.body?.firstChild || doc.firstChild;
      if (replaceNode && el.parentNode) {
        const importedNode = el.ownerDocument.importNode(replaceNode, true);
        el.parentNode.replaceChild(importedNode, el);
      }
      return;
    }
  }
  if (!refusedImage && href.match(IPFS_REGEX) && href.trim().replace(/&amp;/g, "&") === getSerializedInnerHTML(el).trim().replace(/&amp;/g, "&") && href.indexOf("#") === -1) {
    if (forApp) {
      el.setAttribute("data-href", href);
      el.removeAttribute("href");
    }
    el.setAttribute("class", "markdown-img-link");
    removeChildNodes(el);
    const img = el.ownerDocument.createElement("img");
    img.setAttribute("src", href);
    el.appendChild(img);
    return;
  }
  const postMatch = href.match(POST_REGEX);
  if (postMatch && WHITE_LIST.includes(postMatch[1].replace(/^www\./, ""))) {
    el.setAttribute("class", "markdown-post-link");
    const tag = postMatch[2];
    const author = postMatch[3].replace("@", "");
    const permlink = sanitizePermlink(postMatch[4]);
    if (!isValidPermlink(permlink)) return;
    const inlineMeta = getInlineMeta(el, href, author, permlink);
    if (inlineMeta.textMatches) {
      el.textContent = `@${author}/${permlink}`;
    }
    const isInline = inlineMeta.isInline;
    if (forApp) {
      el.removeAttribute("href");
      el.setAttribute("data-href", href);
      el.setAttribute("data-is-inline", "" + isInline);
      el.setAttribute("data-tag", tag);
      el.setAttribute("data-author", author);
      el.setAttribute("data-permlink", permlink);
    } else {
      const h = `/@${author}/${permlink}`;
      el.setAttribute("href", h);
      el.setAttribute("data-is-inline", "" + isInline);
    }
    addLineBreakBeforePostLink(el, forApp, isInline);
    return;
  }
  const mentionMatch = href.match(MENTION_REGEX);
  if (mentionMatch && WHITE_LIST.includes(mentionMatch[1].replace(/^www\./, "")) && mentionMatch.length === 3) {
    const _author = mentionMatch[2].replace("@", "");
    if (!isValidUsername(_author)) return;
    const author = _author.toLowerCase();
    el.setAttribute("class", "markdown-author-link");
    if (author.indexOf("/") === -1) {
      if (el.textContent === href) {
        el.textContent = `@${author}`;
      }
      if (forApp) {
        el.removeAttribute("href");
        el.setAttribute("data-author", author);
      } else {
        const h = `/@${author}`;
        el.setAttribute("href", h);
      }
    }
    return;
  }
  const tpostMatch = href.match(INTERNAL_POST_TAG_REGEX);
  let isValidDomain = false;
  if (tpostMatch && tpostMatch.length === 4) {
    if (tpostMatch[1].indexOf("/") === 0) {
      const path = href.split(/[?#]/, 1)[0];
      const delimiter = activePlaceholderDelimiter();
      const placeholder = path.includes("\u200B") || delimiter !== null && path.includes(delimiter);
      isValidDomain = !placeholder && isInSiteHref(href);
    } else if (tpostMatch[1].includes(".")) {
      const domain = tpostMatch[1].replace(/^https?:\/\//, "").replace(/^www\./, "");
      isValidDomain = WHITE_LIST.includes(domain);
    }
  }
  if (isValidDomain) {
    const pathSegment = tpostMatch[3].split("?")[0];
    if (SECTION_LIST.some((v) => pathSegment === v || pathSegment.startsWith(v + "/"))) {
      el.setAttribute("class", "markdown-profile-link");
      const author = tpostMatch[2].replace("@", "").toLowerCase();
      const section = tpostMatch[3];
      if (!isValidPermlink(section)) return;
      if (el.textContent === href) {
        el.textContent = `@${author}/${section}`;
      }
      const external1 = renderOptions?.externalProfileBase;
      if (forApp || external1) {
        el.setAttribute("href", `${external1 ?? "https://ecency.com"}/@${author}/${section}`);
      } else {
        const h = `/@${author}/${section}`;
        el.setAttribute("href", h);
      }
      return;
    } else {
      let tag = "post";
      if (tpostMatch[1] && !tpostMatch[1].includes(".")) {
        [, tag] = tpostMatch;
        tag = tag.replace("/", "");
      }
      el.setAttribute("class", "markdown-post-link");
      const author = tpostMatch[2].replace("@", "");
      const permlink = sanitizePermlink(tpostMatch[3]);
      if (!isValidPermlink(permlink)) return;
      const communityTag = tag.toLowerCase().startsWith("hive-") ? tag : void 0;
      const inlineMeta = getInlineMeta(el, href, author, permlink, communityTag);
      if (inlineMeta.textMatches) {
        el.textContent = `@${author}/${permlink}`;
      }
      const isInline = inlineMeta.isInline;
      if (forApp) {
        el.removeAttribute("href");
        el.setAttribute("data-href", href);
        el.setAttribute("data-is-inline", "" + isInline);
        el.setAttribute("data-tag", tag);
        el.setAttribute("data-author", author);
        el.setAttribute("data-permlink", permlink);
      } else {
        const h = `/@${author}/${permlink}`;
        el.setAttribute("href", h);
        el.setAttribute("data-is-inline", "" + isInline);
      }
      addLineBreakBeforePostLink(el, forApp, isInline);
      return;
    }
  }
  const imentionMatch = href.match(INTERNAL_MENTION_REGEX);
  if (imentionMatch) {
    const _author = imentionMatch[0].replace("/@", "");
    if (!isValidUsername(_author)) return;
    const author = _author.toLowerCase();
    el.setAttribute("class", "markdown-author-link");
    if (author.indexOf("/") === -1) {
      if (el.textContent === href) {
        el.textContent = `@${author}`;
      }
      if (forApp) {
        el.removeAttribute("href");
        el.setAttribute("data-author", author);
      } else {
        const h = `/@${author}`;
        el.setAttribute("href", h);
      }
    }
    return;
  }
  const cpostMatch = href.match(INTERNAL_POST_REGEX);
  if (cpostMatch && cpostMatch.length === 3 && cpostMatch[1].indexOf("@") === 0) {
    const pathSegment2 = cpostMatch[2].split("?")[0];
    if (SECTION_LIST.some((v) => pathSegment2 === v || pathSegment2.startsWith(v + "/"))) {
      el.setAttribute("class", "markdown-profile-link");
      const author = cpostMatch[1].replace("@", "").toLowerCase();
      const section = cpostMatch[2];
      if (el.textContent === href) {
        el.textContent = `@${author}/${section}`;
      }
      const external2 = renderOptions?.externalProfileBase;
      if (forApp || external2) {
        el.setAttribute("href", `${external2 ?? "https://ecency.com"}/@${author}/${section}`);
      } else {
        const h = `/@${author}/${section}`;
        el.setAttribute("href", h);
      }
      return;
    } else {
      el.setAttribute("class", "markdown-post-link");
      const tag = "post";
      const author = cpostMatch[1].replace("@", "");
      const permlink = sanitizePermlink(cpostMatch[2]);
      if (!isValidPermlink(permlink)) return;
      const inlineMeta = getInlineMeta(el, href, author, permlink);
      if (inlineMeta.textMatches) {
        el.textContent = `@${author}/${permlink}`;
      }
      const isInline = inlineMeta.isInline;
      if (forApp) {
        el.removeAttribute("href");
        el.setAttribute("data-href", href);
        el.setAttribute("data-is-inline", "" + isInline);
        el.setAttribute("data-tag", tag);
        el.setAttribute("data-author", author);
        el.setAttribute("data-permlink", permlink);
      } else {
        const h = `/@${author}/${permlink}`;
        el.setAttribute("href", h);
        el.setAttribute("data-is-inline", "" + isInline);
      }
      addLineBreakBeforePostLink(el, forApp, isInline);
      return;
    }
  }
  const topicMatch = href.match(TOPIC_REGEX);
  if (topicMatch && WHITE_LIST.includes(topicMatch[1].replace(/^www\./, "")) && topicMatch.length === 4) {
    el.setAttribute("class", "markdown-tag-link");
    const filter = topicMatch[2];
    const tag = topicMatch[3];
    if (el.textContent === href) {
      el.textContent = `/${filter}/${tag}`;
    }
    if (forApp) {
      el.removeAttribute("href");
      el.setAttribute("data-filter", filter);
      el.setAttribute("data-tag", tag);
    } else {
      const h = `/${filter}/${tag}`;
      el.setAttribute("href", h);
    }
    return;
  }
  const itopicMatch = href.match(INTERNAL_TOPIC_REGEX);
  if (itopicMatch && itopicMatch.length === 3) {
    el.setAttribute("class", "markdown-tag-link");
    const filter = itopicMatch[1];
    const tag = itopicMatch[2];
    if (el.textContent === href) {
      el.textContent = `/${filter}/${tag}`;
    }
    if (forApp) {
      el.removeAttribute("href");
      el.setAttribute("data-filter", filter);
      el.setAttribute("data-tag", tag);
    } else {
      const h = `/${filter}/${tag}`;
      el.setAttribute("href", h);
    }
    return;
  }
  const comMatch = href.match(CUSTOM_COMMUNITY_REGEX);
  if (comMatch && WHITE_LIST.includes(comMatch[1].replace(/^www\./, ""))) {
    el.setAttribute("class", "markdown-community-link");
    const community = comMatch[2];
    let filter = comMatch[3].substring(1);
    if (!filter) filter = "created";
    if (filter === "about" || filter === "discord") {
      filter = "created";
    }
    if (el.textContent === href) {
      el.textContent = `${filter}/${community}`;
    }
    if (forApp) {
      el.removeAttribute("href");
      el.setAttribute("data-community", community);
      el.setAttribute("data-filter", filter);
    } else {
      const h = `/${filter}/${community}`;
      el.setAttribute("href", h);
    }
    return;
  }
  const cccMatch = href.match(CCC_REGEX);
  if (cccMatch && WHITE_LIST.includes(cccMatch[1].replace(/^www\./, ""))) {
    el.setAttribute("class", "markdown-post-link");
    const tag = "ccc";
    const author = cccMatch[2].replace("@", "");
    const permlink = sanitizePermlink(cccMatch[3]);
    if (!isValidPermlink(permlink)) return;
    const inlineMeta = getInlineMeta(el, href, author, permlink);
    if (inlineMeta.textMatches) {
      el.textContent = `@${author}/${permlink}`;
    }
    const isInline = inlineMeta.isInline;
    if (forApp) {
      el.removeAttribute("href");
      el.setAttribute("data-href", href);
      el.setAttribute("data-is-inline", "" + isInline);
      el.setAttribute("data-tag", tag);
      el.setAttribute("data-author", author);
      el.setAttribute("data-permlink", permlink);
    } else {
      const h = `/@${author}/${permlink}`;
      el.setAttribute("href", h);
      el.setAttribute("data-is-inline", "" + isInline);
    }
    addLineBreakBeforePostLink(el, forApp, isInline);
    return;
  }
  const BCmatch = href.match(BITCHUTE_REGEX);
  if (BCmatch && BCmatch[1] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, "bitchute", `https://www.bitchute.com/embed/${BCmatch[1]}/`, renderOptions);
    return;
  }
  const RBmatch = href.match(RUMBLE_REGEX);
  if (RBmatch && RBmatch[1] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, "rumble", `https://www.rumble.com/embed/${RBmatch[1]}/?pub=4`, renderOptions);
    return;
  }
  const BNmatch = href.match(BRIGHTEON_REGEX);
  if (BNmatch && BNmatch[2] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, "brighteon", `https://www.brighteon.com/embed/${BNmatch[2]}`, renderOptions);
    return;
  }
  const ODmatch = href.match(ODYSEE_WATCH_REGEX);
  if (ODmatch && ODmatch[1] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, "odysee", `https://odysee.com/$/embed/${ODmatch[1]}`, renderOptions);
    return;
  }
  let match = href.match(YOUTUBE_REGEX);
  if (match && match[1] && el.textContent.trim() === href) {
    const videoClass = youtubeVideoLinkClass(match[0]);
    el.setAttribute("class", videoClass);
    el.removeAttribute("href");
    const vid = match[1];
    const thumbnail = proxifyImageSrc(`https://img.youtube.com/vi/${vid.split("?")[0]}/hqdefault.jpg`, 0, 0, "match");
    const embedSrc = `https://www.youtube.com/embed/${vid}?autoplay=1`;
    el.textContent = "";
    el.setAttribute("data-embed-src", embedSrc);
    el.setAttribute("data-youtube", vid);
    const startTime = extractYtStartTime(href);
    if (startTime) {
      el.setAttribute("data-start-time", startTime);
    }
    if (renderOptions?.embedVideosDirectly) {
      const directSrc = `https://www.youtube.com/embed/${vid}`;
      const wrapper = el.ownerDocument.createElement("span");
      wrapper.setAttribute("class", "er-youtube-frame");
      wrapper.setAttribute("style", "display:block");
      const iframe = el.ownerDocument.createElement("iframe");
      iframe.setAttribute("class", "youtube-player");
      iframe.setAttribute("src", directSrc);
      iframe.setAttribute("title", "YouTube video");
      iframe.setAttribute("allow", "accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share");
      iframe.setAttribute("allowfullscreen", "");
      wrapper.appendChild(iframe);
      el.appendChild(wrapper);
      el.setAttribute("class", `${videoClass} er-youtube`);
    } else {
      const thumbImg = el.ownerDocument.createElement("img");
      thumbImg.setAttribute("class", "no-replace video-thumbnail");
      markInternalThumbnail(thumbImg);
      thumbImg.setAttribute("itemprop", "thumbnailUrl");
      thumbImg.setAttribute("src", thumbnail);
      const play = el.ownerDocument.createElement("span");
      play.setAttribute("class", "markdown-video-play");
      el.appendChild(thumbImg);
      el.appendChild(play);
    }
    return;
  }
  match = href.match(VIMEO_REGEX);
  if (match && match[3] && href === el.textContent) {
    el.setAttribute("class", "markdown-video-link markdown-video-link-vimeo");
    el.removeAttribute("href");
    const embedSrc = `https://player.vimeo.com/video/${match[3]}`;
    el.textContent = "";
    const ifr = el.ownerDocument.createElement("iframe");
    ifr.setAttribute("frameborder", "0");
    ifr.setAttribute("allowfullscreen", "true");
    ifr.setAttribute("src", embedSrc);
    el.appendChild(ifr);
    return;
  }
  match = href.match(TWITCH_REGEX);
  if (match && match[2] && href === el.textContent) {
    el.setAttribute("class", "markdown-video-link markdown-video-link-twitch");
    el.removeAttribute("href");
    let embedSrc = "";
    const parent = parentDomain ? `&parent=${parentDomain}` : "";
    if (match[1] === void 0) {
      embedSrc = `https://player.twitch.tv/?channel=${match[2]}${parent}`;
    } else if (match[1] === "videos") {
      embedSrc = `https://player.twitch.tv/?video=${match[2]}${parent}`;
    } else {
      embedSrc = `https://player.twitch.tv/?channel=${match[2]}${parent}`;
    }
    el.textContent = "";
    const ifr = el.ownerDocument.createElement("iframe");
    ifr.setAttribute("frameborder", "0");
    ifr.setAttribute("allowfullscreen", "true");
    ifr.setAttribute("src", embedSrc);
    el.appendChild(ifr);
    return;
  }
  if (el.textContent.trim() === href) {
    SPOTIFY_REGEX.lastIndex = 0;
    match = SPOTIFY_REGEX.exec(href);
    if (match && match[1]) {
      el.setAttribute("class", "markdown-audio-link markdown-audio-link-spotify");
      el.removeAttribute("href");
      const embedSrc = `https://open.spotify.com/embed/playlist/${match[1]}`;
      el.textContent = "";
      const ifr = el.ownerDocument.createElement("iframe");
      ifr.setAttribute("frameborder", "0");
      ifr.setAttribute("allowfullscreen", "true");
      ifr.setAttribute("src", embedSrc);
      ifr.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
      el.appendChild(ifr);
      return;
    }
  }
  match = href.match(LOOM_REGEX);
  if (match && match[2] && el.textContent.trim() === href) {
    el.setAttribute("class", "markdown-video-link markdown-video-link-loom");
    el.removeAttribute("href");
    const embedSrc = `https://www.loom.com/embed/${match[2]}`;
    el.textContent = "";
    const ifr = el.ownerDocument.createElement("iframe");
    ifr.setAttribute("frameborder", "0");
    ifr.setAttribute("allowfullscreen", "true");
    ifr.setAttribute("src", embedSrc);
    ifr.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    el.appendChild(ifr);
    return;
  }
  const imgEls = el.getElementsByTagName("img");
  if (imgEls.length === 1 || el.textContent.trim() === href) {
    D_TUBE_REGEX.lastIndex = 0;
    match = D_TUBE_REGEX.exec(href);
    if (match && match[2] && match[3]) {
      el.setAttribute("class", "markdown-video-link markdown-video-link-dtube");
      el.removeAttribute("href");
      const videoHref = `https://emb.d.tube/#!/${match[2]}/${match[3]}`;
      el.setAttribute("data-embed-src", videoHref);
      if (imgEls.length === 1) {
        const src = imgEls[0].getAttribute("src");
        if (src) {
          const thumbnail = proxifyImageSrc(src.replace(/\s+/g, ""), 0, 0, "match");
          const thumbImg = el.ownerDocument.createElement("img");
          thumbImg.setAttribute("class", "no-replace video-thumbnail");
          markInternalThumbnail(thumbImg);
          thumbImg.setAttribute("itemprop", "thumbnailUrl");
          thumbImg.setAttribute("src", thumbnail);
          el.appendChild(thumbImg);
          el.removeChild(imgEls[0]);
        }
      } else {
        el.textContent = "";
      }
      const play = el.ownerDocument.createElement("span");
      play.setAttribute("class", "markdown-video-play");
      el.appendChild(play);
      return;
    }
  }
  D_TUBE_REGEX2.lastIndex = 0;
  match = D_TUBE_REGEX2.exec(href);
  if (match && match[2] && match[3]) {
    el.setAttribute("class", "markdown-video-link markdown-video-link-dtube");
    el.removeAttribute("href");
    el.textContent = "";
    const videoHref = `https://emb.d.tube/#!/${match[2]}/${match[3]}`;
    el.setAttribute("data-embed-src", videoHref);
    const play = el.ownerDocument.createElement("span");
    play.setAttribute("class", "markdown-video-play");
    el.appendChild(play);
    return;
  }
  match = href.match(SPEAK_REGEX);
  if (match) {
    const imgEls2 = el.getElementsByTagName("img");
    if (imgEls2.length === 1 || el.textContent.trim() === href) {
      if ((match[1] || match[2]) && match[3]) {
        const videoHref = `https://play.3speak.tv/watch?v=${match[3]}&mode=iframe`;
        el.setAttribute("class", "markdown-video-link markdown-video-link-speak");
        el.removeAttribute("href");
        el.setAttribute("data-embed-src", videoHref);
        if (el.textContent.trim() === href) {
          el.textContent = "";
        }
        if (renderOptions?.embedVideosDirectly) {
          const directSrc = `${videoHref}&autoplay=false`;
          const wrapper = el.ownerDocument.createElement("span");
          wrapper.setAttribute("class", "er-speak-frame");
          wrapper.setAttribute("style", "display:block");
          const iframe = el.ownerDocument.createElement("iframe");
          iframe.setAttribute("class", "speak-iframe");
          iframe.setAttribute("src", directSrc);
          iframe.setAttribute("title", "3Speak video");
          iframe.setAttribute("allow", "accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share");
          iframe.setAttribute("allowfullscreen", "");
          wrapper.appendChild(iframe);
          el.appendChild(wrapper);
          el.setAttribute("class", "markdown-video-link markdown-video-link-speak er-speak");
        } else {
          if (imgEls2.length === 1) {
            const src = imgEls2[0].getAttribute("src");
            if (src) {
              const thumbnail = proxifyImageSrc(src.replace(/\s+/g, ""), 0, 0, "match");
              const thumbImg = el.ownerDocument.createElement("img");
              thumbImg.setAttribute("class", "no-replace video-thumbnail");
              markInternalThumbnail(thumbImg);
              thumbImg.setAttribute("itemprop", "thumbnailUrl");
              thumbImg.setAttribute("src", thumbnail);
              el.appendChild(thumbImg);
              el.removeChild(imgEls2[0]);
            }
          }
          const play = el.ownerDocument.createElement("span");
          play.setAttribute("class", "markdown-video-play");
          el.appendChild(play);
        }
        return;
      }
    }
  }
  if (href.match(SPEAK_AUDIO_REGEX) && el.textContent.trim() === href) {
    el.setAttribute("class", "markdown-audio-link markdown-audio-link-speak");
    el.removeAttribute("href");
    const embedSrc = /[?&]iframe=/.test(href) ? href : `${href}&iframe=1`;
    const finalSrc = /[?&]mode=/.test(embedSrc) ? embedSrc : `${embedSrc}&mode=compact`;
    el.textContent = "";
    const ifr = el.ownerDocument.createElement("iframe");
    ifr.setAttribute("frameborder", "0");
    ifr.setAttribute("src", finalSrc);
    ifr.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    el.appendChild(ifr);
    return;
  }
  if (href.match(LIKETU_AUDIO_REGEX)) {
    el.setAttribute("class", "markdown-audio-link markdown-audio-link-liketu");
    el.removeAttribute("href");
    el.textContent = "";
    const audio = el.ownerDocument.createElement("audio");
    audio.setAttribute("controls", "");
    audio.setAttribute("preload", "metadata");
    audio.setAttribute("src", href);
    el.appendChild(audio);
    return;
  }
  const matchT = href.match(TWITTER_REGEX);
  if (matchT && el.textContent.trim() === href) {
    TWITTER_REGEX.lastIndex = 0;
    const e = TWITTER_REGEX.exec(href);
    if (e) {
      const url = stripHtmlTags(e[0]);
      const author = stripHtmlTags(e[1]);
      const blockquote = el.ownerDocument.createElement("blockquote");
      blockquote.setAttribute("class", "twitter-tweet");
      const p = el.ownerDocument.createElement("p");
      p.textContent = url;
      const textNode = el.ownerDocument.createTextNode("- ");
      const a2 = el.ownerDocument.createElement("a");
      a2.setAttribute("href", url);
      a2.textContent = author;
      blockquote.appendChild(p);
      blockquote.appendChild(textNode);
      blockquote.appendChild(a2);
      if (el.parentNode) {
        el.parentNode.replaceChild(blockquote, el);
      }
      return;
    }
  }
  if (href.indexOf("https://hivesigner.com/sign/account-witness-vote?witness=") === 0 && forApp) {
    el.setAttribute("class", "markdown-witnesses-link");
    el.setAttribute("data-href", href);
    el.removeAttribute("href");
    return;
  }
  if (href.indexOf("hivesigner.com/sign/update-proposal-votes?proposal_ids") >= 0 && forApp) {
    try {
      const m = decodeURI(href).match(/proposal_ids=\[(\d+)]/);
      if (m) {
        el.setAttribute("class", "markdown-proposal-link");
        el.setAttribute("data-href", href);
        el.setAttribute("data-proposal", m[1]);
        el.removeAttribute("href");
        return;
      }
    } catch (e) {
    }
  }
  el.setAttribute("class", "markdown-external-link");
  if (!/^((#)|(mailto:)|(tel:)|(web\+[a-z0-9.+-]+:)|(\/(?!\/))|(((steem|hive|esteem|ecency|https?):)?\/\/))/i.test(href)) {
    href = `https://${href}`;
  }
  if (forApp) {
    el.removeAttribute("rel");
    el.removeAttribute("target");
    el.setAttribute("data-href", href);
    const match2 = href.match(YOUTUBE_REGEX);
    if (match2 && match2[1]) {
      const vid = match2[1];
      el.setAttribute("data-youtube", vid);
      const startTime = extractYtStartTime(href);
      if (startTime) {
        el.setAttribute("data-start-time", startTime);
      }
    }
    el.removeAttribute("href");
  } else {
    const matchS = href.trim().startsWith("#");
    if (matchS) {
      el.setAttribute("class", "markdown-internal-link");
      el.removeAttribute("rel");
      el.removeAttribute("target");
    } else {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", getExternalLinkRel(seoContext));
    }
    el.setAttribute("href", href);
  }
}

export { a };
//# sourceMappingURL=chunk-DT4QSWTQ.js.map
//# sourceMappingURL=chunk-DT4QSWTQ.js.map