// link regex
export const URL_REGEX = /(https?:\/\/[^\s]+)/g
export const IMG_REGEX = /(https?:\/\/.*\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw))(.*)/gim
export const ECENCY_IMG_REGEX = /https?:\/\/images\.ecency\.com\/(?:(?:p|DQm[a-zA-Z0-9]+)\/)?[^\s"'<>]+/gi
export const IPFS_REGEX = /^https?:\/\/[^/]+\/(ip[fn]s)\/([^/?#]+)/gim
// Matches Hive post URLs: scheme://domain/tag/@author/permlink.
// Both path segments are pinned to `[^/]+` (no `/`), and both ends are
// anchored. The previous form `^https?://(.*)/(.*)/(@…)/(.*)` had three
// `.*` quantifiers that could exchange characters, triggering
// super-linear backtracking on adversarial hrefs. Matching is now O(n)
// and the captured `domain`/`tag` shape is unchanged — in particular,
// multi-segment-middle URLs like `host/foo/bar/@user/perm` still don't
// match, preserving the old whitelist-rejection behaviour (the previous
// greedy form put `host/foo` in capture 1, which then failed the
// WHITE_LIST check in a.method.ts; this stricter form fails the regex
// outright, with the same downstream outcome).
export const POST_REGEX = /^https?:\/\/([^/]+)\/([^/]+)\/(@[\w.\d-]+)\/(.+)$/i
export const CCC_REGEX = /^https?:\/\/(.*)\/ccc\/([\w.\d-]+)\/(.*)/i
export const MENTION_REGEX = /^https?:\/\/(.*)\/(@[\w.\d-]+)$/i
export const TOPIC_REGEX = /^https?:\/\/(.*)\/(trending|hot|created|promoted|muted|payout)\/(.*)$/i
export const INTERNAL_MENTION_REGEX = /^\/@[\w.\d-]+$/i
export const INTERNAL_TOPIC_REGEX = /^\/(trending|hot|created|promoted|muted|payout)\/(.*)$/i
// Matches both internal `/tag/@author/permlink` and external
// `https://host/tag/@author/permlink` hrefs. Group 1 must be allowed
// to contain `/` so we keep `.+?` (lazy, anchored start). The previous
// form `(.*)/(@…)/(.*)` was unanchored with two `.*` quantifiers, so
// `regexp/no-super-linear-move` flagged it as quadratic on hrefs
// without a `/@user/` substring (engine retried at every starting
// position). The lazy + anchored variant keeps matching attempts O(n).
export const INTERNAL_POST_TAG_REGEX = /^(.+?)\/(@[\w.\d-]+)\/(.*)$/i
export const INTERNAL_POST_REGEX = /^\/(@[\w.\d-]+)\/(.*)$/i
export const CUSTOM_COMMUNITY_REGEX = /^https?:\/\/(.*)\/c\/(hive-\d+)(.*)/i
export const YOUTUBE_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|shorts\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
export const YOUTUBE_EMBED_REGEX = /^(https?:)?\/\/www\.youtube\.com\/(embed|shorts)\/.*/i
export const VIMEO_REGEX = /(https?:\/\/)?(www\.)?(?:vimeo)\.com.*(?:videos|video|channels|)\/([\d]+)/i
export const VIMEO_EMBED_REGEX = /https:\/\/player\.vimeo\.com\/video\/([0-9]+)(?:$|[?#])/
export const BITCHUTE_REGEX = /^(?:https?:\/\/)?(?:www\.)?bitchute\.com\/(?:video|embed)\/([a-z0-9]+)/i
export const D_TUBE_REGEX = /(https?:\/\/d\.tube\/#!\/v\/)(\w+)\/(\w+)/g
export const D_TUBE_REGEX2 = /(https?:\/\/d\.tube\/v\/)(\w+)\/(\w+)/g
export const D_TUBE_EMBED_REGEX = /^https:\/\/emb\.d\.tube\/#!\/[^/?#]+\/[^/?#]+(?:$|[?#])/i
export const TWITCH_REGEX = /https?:\/\/(?:www\.)?twitch\.tv\/(?:(videos)\/)?([a-zA-Z0-9][\w]{3,24})/i
export const DAPPLR_REGEX = /^(https?:)?\/\/[a-z]*\.dapplr\.in\/file\/dapplr-videos\/.*/i
export const TRUVVL_REGEX = /^https?:\/\/embed\.truvvl\.com\/(@[\w.\d-]+)\/(.*)/i
export const LBRY_REGEX = /^(https?:)?\/\/lbry\.tv\/\$\/embed\/[^?#]+(?:$|[?#])/i
export const ODYSEE_REGEX = /^(https?:)?\/\/odysee\.com\/(?:\$|%24)\/embed\/[^?#]+(?:$|[?#])/i
// Odysee "watch" URLs — the canonical form a user copies from the address bar,
// e.g. https://odysee.com/@channel:2/video-title:e (or https://odysee.com/video-title:e
// for a claim posted outside a channel). Odysee's embed route mirrors the watch
// path (/$/embed/<path>), so the mapping is deterministic and needs no network
// lookup; capture group 1 is that path.
//
// Two alternatives rather than one optional-channel form, because the collapsed
// version also matches a bare channel page (/@channel:2), which is not a video.
// The first alternative requires both segments; the second forbids a leading `@`.
// Special routes (/$/embed, /$/download, and their %24 spellings) are excluded
// for free: their first segment carries no `:`.
// Each segment class excludes the URL structural characters plus quote/angle/
// backslash, so a captured path can never break out of the attribute it is
// written into, and excludes `:` so the `+` cannot exchange characters with the
// following separator (keeps matching linear).
export const ODYSEE_WATCH_REGEX =
  /^(?:https?:)?\/\/odysee\.com\/(@[^/?#\s:"'<>\\]+:[^/?#\s:"'<>\\]+\/[^/?#\s:"'<>\\]+:[^/?#\s:"'<>\\]+|[^@/?#\s:"'<>\\][^/?#\s:"'<>\\]*:[^/?#\s:"'<>\\]+)(?:$|[?#])/i
export const SKATEHIVE_IPFS_REGEX = /^https?:\/\/ipfs\.skatehive\.app\/ipfs\/([^/?#]+)/i
export const SKATEHYPE_EMBED_REGEX = /^(https?:)?\/\/(www\.)?skatehype\.com\/ifplay\.php\?v=\d+(?:$|[&#])/i
export const ARCH_REGEX = /^(https?:)?\/\/archive\.org\/embed\/[^/?#]+(?:$|[?#])/i
export const SPEAK_REGEX = /(?:https?:\/\/(?:(?:play\.)?3speak\.([a-z]+)\/watch\?v=)|(?:(?:play\.)?3speak\.([a-z]+)\/embed\?v=))([A-Za-z0-9_\-\.\/]+)(&.*)?/i
export const SPEAK_EMBED_REGEX = /^(https?:)?\/\/(?:play\.)?3speak\.([a-z]+)\/(?:embed|watch)\?.+$/i
export const SPEAK_AUDIO_REGEX = /https?:\/\/audio\.3speak\.tv\/play\?[^\s]+/i
export const SPEAK_AUDIO_EMBED_REGEX = /^https?:\/\/audio\.3speak\.tv\/play\?.+$/i
// Liketu Speak voice posts link the original audio on cdn.liketu.com (.webm etc).
// Note: matches .webm/.mp3/.m4a/.ogg/.wav but NOT .webp image thumbnails.
export const LIKETU_AUDIO_REGEX = /^https?:\/\/cdn\.liketu\.com\/.+\.(?:webm|mp3|m4a|ogg|wav)(?:\?.*)?$/i
export const TWITTER_REGEX = /(?:https?:\/\/(?:(?:twitter\.com\/(.*?)\/status\/(.*))))/gi
export const SPOTIFY_REGEX = /^https:\/\/open\.spotify\.com\/playlist\/(.*)?$/gi
export const RUMBLE_REGEX  = /^https:\/\/rumble\.com\/embed\/([a-zA-Z0-9-]+)\/\?pub=\w+/
export const BRIGHTEON_REGEX = /^https?:\/\/(www\.)?brighteon\.com\/(?:embed\/)?(.*[0-9].*)/i
export const VIMM_EMBED_REGEX = /^https:\/\/www\.vimm\.tv\/[^?#]+(?:$|[?#])/i
export const SPOTIFY_EMBED_REGEX = /^https:\/\/open\.spotify\.com\/(embed|embed-podcast)\/(playlist|show|episode|track|album)\/([^/?#]+)(?:$|[?#])/i
export const SOUNDCLOUD_EMBED_REGEX = /^https:\/\/w\.soundcloud\.com\/player\/\?[^#]+$/i
export const TWITCH_EMBED_REGEX = /^(https?:)?\/\/player\.twitch\.tv\/(?:\?[^/]+)?$/i
export const BRAND_NEW_TUBE_REGEX = /^https:\/\/brandnewtube\.com\/embed\/[a-z0-9]+$/i
export const LOOM_REGEX = /^(https?:)?\/\/www\.loom\.com\/share\/([^/?#]+)(?:$|[?#])/i
export const LOOM_EMBED_REGEX = /^(https?:)?\/\/www\.loom\.com\/embed\/([^/?#]+)(?:$|[?#])/i
export const AUREAL_EMBED_REGEX = /^(https?:)?\/\/(www\.)?(?:aureal-embed)\.web\.app\/([0-9]+)(?:$|[?#])/i
export const ENTITY_REGEX = /&([a-z0-9]+|#[0-9]{1,6}|#x[0-9a-fA-F]{1,6});/ig
export const SECTION_REGEX = /\B(\#[\da-zA-Z-_]+\b)(?!;)/i
export const ID_WHITELIST = /^[A-Za-z][-A-Za-z0-9_]*$/

