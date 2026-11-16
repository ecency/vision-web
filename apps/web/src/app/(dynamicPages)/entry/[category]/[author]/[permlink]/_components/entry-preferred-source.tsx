import { UilGoogle } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { getGooglePreferredSourceUrl } from "@/utils/google-preferred-source";

interface Props {
  base?: string;
}

/**
 * Plain server-rendered link into Google's Preferred Sources picker, pre-filled
 * with the site's domain. It adds the site, not the post's author, so the copy
 * names the site. Renders nothing off the canonical host.
 */
export function EntryPreferredSource({ base }: Props) {
  const href = getGooglePreferredSourceUrl(base);
  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 mt-2 text-sm text-blue-dark-sky hover:underline"
    >
      <UilGoogle className="size-4" aria-hidden="true" />
      {i18next.t("entry.preferred-source")}
    </a>
  );
}
