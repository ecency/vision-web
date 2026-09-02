import i18next from "i18next";
import type { DigestType } from "./types";

/**
 * The one human label for a digest subscription, used everywhere a subscription
 * is listed: settings, the confirm page, the unsubscribe page. One function so
 * a new type gets its label in one place; a fallback that silently relabels a
 * type as another (site shown as "your notification digest") is exactly what
 * this replaces.
 */
export function describeDigest(type: DigestType | string, target: string): string {
  switch (type) {
    case "community":
      return i18next.t("newsletter.row-community", { name: target });
    case "creator":
      return i18next.t("newsletter.row-creator", { name: target });
    case "site":
      return i18next.t("newsletter.row-site");
    case "tag":
      return i18next.t("newsletter.row-tag", { name: target });
    case "own":
      return i18next.t("newsletter.row-own");
    default:
      return i18next.t("newsletter.row-unknown", { type });
  }
}
