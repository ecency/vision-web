import { ThreeSpeakUploadLimit } from "@/api/threespeak-embed/upload-limits";
import { Alert } from "@ui/alert";
import i18next from "i18next";
import React from "react";

/** `iso` in the viewer's own time zone and language, or null when it cannot be read. */
export function formatUploadLimitTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  try {
    return new Intl.DateTimeFormat(i18next.language || undefined, options).format(date);
  } catch {
    // An unknown language tag throws a RangeError; fall back to the browser's.
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

/**
 * The notice text, built from the refusal's fields so it can be translated.
 * 3Speak's own `message` is English only, so it is the fallback when the
 * fields are missing.
 */
export function getUploadLimitText(limit: ThreeSpeakUploadLimit): string {
  const parts: string[] = [];
  if (limit.kind && limit.limit != null && limit.limit > 0) {
    parts.push(i18next.t(`video-upload.limit-${limit.kind}`, { count: limit.limit }));
  } else {
    parts.push(limit.message ?? i18next.t("video-upload.limit-reached"));
    // 3Speak's message already says when the next upload is possible.
    if (limit.message) return parts.join(" ");
  }
  const time = formatUploadLimitTime(limit.nextAt);
  if (time) {
    parts.push(i18next.t("video-upload.limit-next", { time }));
  }
  return parts.join(" ");
}

interface Props {
  limit: ThreeSpeakUploadLimit;
  /** Used for the upgrade link when the refusal carried none (the quota notice). */
  username?: string;
}

export function VideoUploadLimitNotice({ limit, username }: Props) {
  const upgradeUrl =
    limit.upgradeUrl ??
    (username ? `https://3speak.tv/wallet/${encodeURIComponent(username)}#pro` : null);

  return (
    <Alert appearance="warning" className="mb-3" role="alert">
      <p>{getUploadLimitText(limit)}</p>
      {upgradeUrl && (
        <a
          className="mt-2 inline-block font-semibold underline"
          href={upgradeUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {i18next.t("video-upload.limit-upgrade")}
        </a>
      )}
    </Alert>
  );
}
