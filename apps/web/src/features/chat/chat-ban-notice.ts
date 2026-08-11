import i18next from "i18next";

/**
 * Builds what a banned user actually reads.
 *
 * The server sends `bannedUntil` (epoch ms) and an optional `reason`, and deliberately does NOT
 * send display copy: the remaining time has to be computed at render time so it counts down, and
 * the wording has to be localisable. The server's own `error` string is operator-facing (it names
 * the account and quotes an ISO timestamp) and must not be shown to the person who is banned.
 *
 * Reasons come from the moderation service. An unknown or absent reason degrades to the generic
 * message rather than failing, because older bans predate the reason prop and a newer service
 * version may add reasons this build has never heard of.
 */
export type ChatBanInfo = {
  bannedUntil: number;
  reason?: string;
};

/** Extracts ban info from a thrown request error, or null when it isn't a ban. */
export function getChatBanInfo(error: unknown, now = Date.now()): ChatBanInfo | null {
  const e = error as { status?: number; bannedUntil?: unknown; reason?: unknown } | null;
  const bannedUntil = Number(e?.bannedUntil);

  if (!e?.bannedUntil || Number.isNaN(bannedUntil) || bannedUntil <= now) {
    return null;
  }

  return {
    bannedUntil,
    reason: typeof e.reason === "string" ? e.reason : undefined
  };
}

/**
 * Coarse, human remaining time. Deliberately approximate ("about 2 days") rather than precise:
 * the exact second is noise, and rounding up avoids promising an unlock that has not happened yet.
 */
export function formatBanRemaining(bannedUntil: number, now = Date.now()): string {
  const ms = Math.max(0, bannedUntil - now);
  const minutes = Math.ceil(ms / 60000);

  if (minutes <= 1) {
    return i18next.t("chat.ban-remaining-soon", { defaultValue: "in under a minute" });
  }
  if (minutes < 60) {
    return i18next.t("chat.ban-remaining-minutes", {
      defaultValue: "in about {{count}} minutes",
      count: minutes
    });
  }

  const hours = Math.round(ms / 3600000);
  if (hours < 48) {
    return i18next.t("chat.ban-remaining-hours", {
      defaultValue: "in about {{count}} hours",
      count: Math.max(1, hours)
    });
  }

  const days = Math.round(ms / 86400000);
  return i18next.t("chat.ban-remaining-days", {
    defaultValue: "in about {{count}} days",
    count: days
  });
}

/** The reason sentence. Never names the detection thresholds or the underlying prop. */
function reasonSentence(reason?: string): string {
  switch (reason) {
    case "spray":
      return i18next.t("chat.ban-reason-spray", {
        defaultValue:
          "You're paused from posting because the same message went to several channels at once."
      });
    case "mass-dm":
      return i18next.t("chat.ban-reason-mass-dm", {
        defaultValue:
          "You're paused from posting because a message was sent to many people at once."
      });
    default:
      // Covers "manual" and anything this build doesn't recognise.
      return i18next.t("chat.ban-reason-generic", {
        defaultValue: "You're paused from posting in chat."
      });
  }
}

/**
 * Full notice: what happened, that reading still works, and when it lifts.
 * `now` is injectable so the countdown can be re-rendered and so tests are deterministic.
 */
export function formatChatBanNotice(info: ChatBanInfo, now = Date.now()): string {
  const stillReadable = i18next.t("chat.ban-can-still-read", {
    defaultValue: "You can still read chat."
  });
  const unlocks = i18next.t("chat.ban-unlocks", {
    defaultValue: "Posting unlocks {{when}}.",
    when: formatBanRemaining(info.bannedUntil, now)
  });

  return `${reasonSentence(info.reason)} ${stillReadable} ${unlocks}`;
}
