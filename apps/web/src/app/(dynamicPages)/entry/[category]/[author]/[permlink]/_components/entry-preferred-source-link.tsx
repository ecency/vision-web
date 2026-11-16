"use client";

import { UilGoogle } from "@tooni/iconscout-unicons-react";
import { trackEvent } from "@/utils/track-event";

interface Props {
  href: string;
  label: string;
}

// The only client part of the Preferred Sources link: the click event (#1495).
export function EntryPreferredSourceLink({ href, label }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 mt-2 text-sm text-blue-dark-sky hover:underline"
      onClick={() => trackEvent("Preferred Source: Click")}
    >
      <UilGoogle className="size-4" aria-hidden="true" />
      {label}
    </a>
  );
}
