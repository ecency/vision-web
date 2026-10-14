import { isMattermostSuperAdmin, MattermostUser } from "@/server/mattermost";

/** Mentions that notify a whole channel. Mattermost honours @here, @channel and @all. */
export const SPECIAL_MENTIONS = new Set(["here", "everyone", "channel", "all"]);

const SYSTEM_MENTIONS = new Set([...SPECIAL_MENTIONS].map((name) => `@${name}`));
const isSystemMention = (word: string) => SYSTEM_MENTIONS.has(word.toLowerCase());

// Mattermost reads the text after markdown: numeric character references are
// letters by then, and an emoji code such as ":smile:" is a node of its own.
// Code, links and URLs are not skipped here: getting markdown exactly right is
// the only way to skip them safely, so "@all" quoted in code is refused too.
function asMattermostReadsIt(message: string) {
  return message
    .replace(/&#(\d{1,7});/g, (match, code: string) => fromCodePoint(Number(code), match))
    .replace(/&#[xX]([0-9a-fA-F]{1,6});/g, (match, code: string) =>
      fromCodePoint(parseInt(code, 16), match)
    )
    .replace(/&commat;/gi, "@")
    .replace(/(^|[^A-Za-z0-9_]):[a-z0-9_+-]+:(?![A-Za-z0-9_])/g, "$1 ");
}

function fromCodePoint(code: number, fallback: string) {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback;
}

/**
 * Whether Mattermost could notify the whole channel for this text. Mirrors its
 * mention parser (app/mention_parser_standard.go, v10.11): words split on
 * anything but letters, digits and ":.-_@", leading ":.-_" trimmed, trailing
 * ".-:_" tried off one at a time, and a word not starting with "@" split again
 * on ".-:" so "x.@all" still counts.
 */
export function hasChannelWideMention(message: string) {
  // Both readings are checked, so neither can hide a mention from the other.
  return hasSystemMentionWord(message) || hasSystemMentionWord(asMattermostReadsIt(message));
}

function hasSystemMentionWord(text: string) {
  const words = text.split(/[^:.\-_@\p{L}\p{N}]+/u);

  for (const raw of words) {
    if (!raw || (raw.startsWith(":") && raw.endsWith(":"))) continue;

    const word = raw.replace(/^[:.\-_]+/, "");
    if (isSystemMention(word)) return true;

    for (let rest = word; /[.\-:_]$/.test(rest); ) {
      rest = rest.slice(0, -1);
      if (isSystemMention(rest)) return true;
    }

    if (!word.startsWith("@") && /[.\-:]/.test(word)) {
      if (word.split(/[.\-:]+/).some(isSystemMention)) return true;
    }
  }
  return false;
}

/**
 * Community moderators may notify their channel and the chat admin any channel.
 * In a direct message it reaches only the other person, so anyone may.
 */
export function canMentionEveryone(moderation: {
  canModerate: boolean;
  currentUser: Pick<MattermostUser, "username" | "roles">;
  channel?: { type?: string };
}) {
  return (
    moderation.channel?.type === "D" ||
    moderation.canModerate ||
    isMattermostSuperAdmin(moderation.currentUser)
  );
}

export const CHANNEL_WIDE_MENTION_FORBIDDEN =
  "Only moderators can mention everyone in this channel.";

// The post props our clients send: reply context and a link preview. Anything
// else, such as attachments whose text Mattermost also reads mentions from, is
// dropped rather than forwarded.
const ALLOWED_POST_PROPS = new Set([
  "parent_id",
  "parent_username",
  "parent_message",
  "link_url",
  "link_title",
  "link_summary",
  "link_image"
]);

export function pickPostProps(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const props = Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      ([key, value]) => ALLOWED_POST_PROPS.has(key) && typeof value === "string"
    )
  ) as Record<string, string>;
  return Object.keys(props).length ? props : undefined;
}
