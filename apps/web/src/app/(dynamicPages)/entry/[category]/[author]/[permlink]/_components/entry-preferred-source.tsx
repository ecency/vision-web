import i18next from "i18next";
import { getGooglePreferredSourceUrl } from "@/utils/google-preferred-source";
import { EntryPreferredSourceLink } from "./entry-preferred-source-link";

interface Props {
  base?: string;
}

/**
 * Link into Google's Preferred Sources picker, pre-filled with the site's
 * domain. It adds the site, not the post's author, so the copy names the site.
 * Renders nothing off the canonical host. The host check and copy stay on the
 * server; only the link (for its click event) is a client component.
 */
export function EntryPreferredSource({ base }: Props) {
  const href = getGooglePreferredSourceUrl(base);
  if (!href) {
    return null;
  }

  return <EntryPreferredSourceLink href={href} label={i18next.t("entry.preferred-source")} />;
}
