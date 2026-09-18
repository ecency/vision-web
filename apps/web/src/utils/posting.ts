import getSlug from "speakingurl";
import { diff_match_patch } from "diff-match-patch";
import { SECTION_LIST } from "@ecency/render-helper";
import { BeneficiaryRoute, CommentOptions, MetaData, RewardType } from "@/entities";

const permlinkRnd = () => (Math.random() + 1).toString(16).substring(2);

const permlinkPattern = /^[a-z0-9-]{1,255}$/;

// A post permlink must never be exactly a reserved profile-section slug (e.g.
// "followers", "wallet"), or its canonical /@author/<permlink> URL would
// resolve to that section page instead of the post. SECTION_LIST is the shared
// render-helper list of routed sections; referenced lazily (inside the
// functions) to avoid an import-time evaluation order issue.
const isReservedSectionSlug = (slug: string): boolean => SECTION_LIST.includes(slug);

export const createPermlink = (title: string, random: boolean = false): string => {
  // Ensure the string is valid and normalized
  let slug = getSlug(title || "", { lang: false, symbols: true }) ?? "";

  // Normalize and remove problematic Unicode characters
  slug = slug
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
      .replace(/[^a-zA-Z0-9 -]/g, "") // Remove emoji and symbols
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-") // Replace spaces with dashes
      .replace(/-+/g, "-"); // Collapse repeated dashes

  // Fallback if result is empty
  if (!slug || slug.length === 0) {
    return permlinkRnd().toLowerCase();
  }

  const parts = slug.split("-");
  let perm = parts.length > 5 ? parts.slice(0, 5).join("-") : slug;

  if (random) {
    const rnd = permlinkRnd().toLowerCase();
    perm = `${perm}-${rnd}`;
  }

  // Append random chars if the slug is exactly a reserved section so the post
  // can't be shadowed by a section page.
  if (isReservedSectionSlug(perm)) {
    perm = `${perm}-${permlinkRnd().toLowerCase()}`;
  }

  if (perm.length > 255) {
    perm = perm.substring(0, 250);
  }

  return perm;
};

export const ensureValidPermlink = (
  permlink: string,
  fallbackTitle: string
): string => {
  const normalizedPermlink = permlink?.trim().toLowerCase();

  // A regex-valid, user-provided permlink is accepted as-is — unless it is a
  // reserved section slug, in which case it falls through to createPermlink
  // (below) which appends random chars to avoid the route collision.
  if (
    normalizedPermlink &&
    permlinkPattern.test(normalizedPermlink) &&
    !isReservedSectionSlug(normalizedPermlink)
  ) {
    return normalizedPermlink;
  }

  const derivedPermlink = createPermlink(permlink || fallbackTitle);

  if (permlinkPattern.test(derivedPermlink)) {
    return derivedPermlink;
  }

  return createPermlink(fallbackTitle, true);
};


/**
 * The Ecency host pattern runs to the next whitespace or quote, so in markdown
 * (`![](url)`, `[![](url)](link)`) it swallows the closing parenthesis and
 * whatever follows it. Cut at the first `)` that closes nothing opened inside
 * the URL, which keeps a filename such as `photo_(1).jpg` intact. Only applied
 * to a URL that opens right after `(`: in an HTML attribute or bare text a `)`
 * can belong to the URL itself.
 */
const cutAtUnmatchedParen = (url: string): string => {
  let depth = 0;
  for (let i = 0; i < url.length; i++) {
    if (url[i] === "(") {
      depth++;
    } else if (url[i] === ")") {
      if (depth === 0) {
        return url.slice(0, i);
      }
      depth--;
    }
  }
  return url;
};

const EXTENSION_TAIL = /\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)$/i;
// A markdown destination opens right after "(", give or take spaces.
const MARKDOWN_OPENER = /\(\s*$/;

/**
 * Collects every URL a pattern finds, cutting a markdown destination at its closing
 * parenthesis. Matching runs to the next whitespace or quote, so two images written back to
 * back read as one match: scanning resumes right after the URL that was kept, which is what
 * lets the second one be found. A match that cuts down to something that is no longer an
 * image is dropped rather than stored broken.
 */
interface FoundImage {
  url: string;
  /** Where the match started in the body, which is what tells one occurrence from another. */
  index: number;
}

const collectImages = (body: string, pattern: RegExp, needsExtension: boolean): FoundImage[] => {
  const found: FoundImage[] = [];
  const scan = new RegExp(pattern.source, pattern.flags);
  let match: RegExpExecArray | null;

  while ((match = scan.exec(body)) !== null) {
    const raw = match[0];
    const cut = MARKDOWN_OPENER.test(body.slice(0, match.index)) ? cutAtUnmatchedParen(raw) : raw;
    const keep = cut && (!needsExtension || EXTENSION_TAIL.test(cut)) ? cut : "";

    if (keep) {
      found.push({ url: keep, index: match.index });
    }

    scan.lastIndex = match.index + Math.max((keep || cut).length, 1);
  }

  return found;
};

export const extractMetaData = (body: string, initialMeta: MetaData = {}): MetaData => {
  // Match images with common file extensions (including RAW formats like .arw)
  const imgReg = /https?:\/\/[^\s"']+\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)/gi;

  // Match Ecency image host URLs (i/img/images.ecency.com), which may not have file extensions
  const ecencyImgReg =
    /https?:\/\/(?:i|img|images)\.ecency\.com\/(?:(?:p|DQm[a-zA-Z0-9]+)\/)?[^\s"'<>]+/gi;

  const found = [...collectImages(body, imgReg, true), ...collectImages(body, ecencyImgReg, false)];

  // The extension pattern has to end at the extension, so one occurrence can be recorded
  // twice: cut short by that pattern and whole by the Ecency one. Both start at the same
  // place in the body, which is what separates them from two different images that merely
  // share a prefix, such as /p/abc and /p/abc?mode=fit written side by side.
  const isTruncatedCopy = (image: FoundImage) =>
    found.some(
      (other) =>
        other.index === image.index &&
        other.url.length > image.url.length &&
        other.url.startsWith(image.url)
    );
  const bodyImages = found.filter((image) => !isTruncatedCopy(image)).map((image) => image.url);

  // A post saved before the cut above carries both the URL and the same URL with a trailing
  // parenthesis. Drop the broken twin rather than offer it as a thumbnail forever.
  const isBrokenTwin = (url: string) => url.endsWith(")") && bodyImages.includes(url.slice(0, -1));

  // Likewise a URL saved before the fix above, cut short of its query or fragment. It counts
  // as stale only while the body no longer holds it on its own, so an image that really is
  // published both ways keeps both entries.
  const isCutShortCopy = (url: string) =>
    !bodyImages.includes(url) &&
    bodyImages.some(
      (other) => other.startsWith(url) && (other[url.length] === "?" || other[url.length] === "#")
    );
  const isStale = (url: string) => isBrokenTwin(url) || isCutShortCopy(url);
  const existingImages = (Array.isArray(initialMeta.image) ? initialMeta.image : []).filter((url) => !isStale(url));
  const existingThumbnails = (Array.isArray(initialMeta.thumbnails) ? initialMeta.thumbnails : []).filter((url) => !isStale(url));

  const allImages = Array.from(new Set([...existingImages, ...bodyImages]));

  const out: MetaData = { ...initialMeta };

  if (allImages.length > 0) {
    out.image = allImages.slice(0, 10);
    out.thumbnails = Array.from(
        new Set([...existingThumbnails, ...existingImages, ...bodyImages])
    );
  }

  return out;
};

export const makeApp = (appVer: string) => `ecency/${appVer}-vision`;

export const makeJsonMetaData = (
  meta: MetaData,
  tags: string[],
  description: string | null,
  appVer: string
): MetaData =>
  Object.assign({}, meta, {
    tags,
    description,
    app: makeApp(appVer),
    format: "markdown+html"
  });

export const makeJsonMetaDataReply = (tags: string[], appVer: string) => ({
  tags,
  app: makeApp(appVer),
  format: "markdown+html"
});

export const makeCommentOptions = (
  author: string,
  permlink: string,
  rewardType: RewardType,
  beneficiaries?: BeneficiaryRoute[]
): CommentOptions | null => {
  const sanitizedBeneficiaries = beneficiaries?.map(({ src: _src, ...route }) => ({
    ...route
  }));

  const hasBeneficiaries =
    !!sanitizedBeneficiaries && sanitizedBeneficiaries.length > 0;

  if (!hasBeneficiaries && rewardType === "default") {
    return null;
  }

  const sortedBeneficiaries = sanitizedBeneficiaries
    ? [...sanitizedBeneficiaries].sort((a, b) =>
        a.account.localeCompare(b.account)
      )
    : undefined;
  const opt: CommentOptions = {
    allow_curation_rewards: true,
    allow_votes: true,
    author,
    permlink,
    max_accepted_payout: "1000000.000 HBD",
    percent_hbd: 10000,
    extensions: hasBeneficiaries ? [[0, { beneficiaries: sortedBeneficiaries! }]] : []
  };

  switch (rewardType) {
    case "sp":
      opt.max_accepted_payout = "1000000.000 HBD";
      opt.percent_hbd = 0;
      break;
    case "dp":
      opt.max_accepted_payout = "0.000 HBD";
      opt.percent_hbd = 10000;
      break;
    case "default":
      opt.max_accepted_payout = "1000000.000 HBD";
      opt.percent_hbd = 10000;
      break;
  }

  return opt;
};

export const createReplyPermlink = (toAuthor?: string) => {
  const t = new Date(Date.now());

  const timeFormat = `${t.getFullYear().toString()}${(t.getMonth() + 1).toString()}${t
    .getDate()
    .toString()}t${t.getHours().toString()}${t.getMinutes().toString()}${t
    .getSeconds()
    .toString()}${t.getMilliseconds().toString()}z`;

  return `re-${toAuthor?.replace(/\./g, "")}-${timeFormat}`;
};

export function createWavePermlink() {
  const t = new Date(Date.now());

  const timeFormat = `${t.getFullYear().toString()}${(t.getMonth() + 1).toString()}${t
    .getDate()
    .toString()}t${t.getHours().toString()}${t.getMinutes().toString()}${t
    .getSeconds()
    .toString()}${t.getMilliseconds().toString()}z`;

  return `wave-${timeFormat}`;
}

export const createPatch = (text1: string, text2: string): string | undefined => {
  const dmp = new diff_match_patch();
  if (text1 === "") return undefined;
  const patches = dmp.patch_make(text1, text2);
  return dmp.patch_toText(patches);
};
