"use client";

import { primeEnglishFaq } from "./faq";

interface Props {
  resources: { static: { faq: Record<string, string> } };
}

/**
 * Hands the server-loaded English FAQ articles to the client before the FAQ
 * page's client components hydrate. English only, see primeEnglishFaq; a
 * visitor on another language gets the whole locale file through loadLocale
 * when the client switches. Rendered by the server page ahead of them, so the
 * registration (idempotent, no listeners) happens in tree order during the
 * hydration render and those components see the same strings the server
 * rendered; loading them in an effect instead would hydrate raw keys first and
 * then flash to the text (#1598).
 */
export function FaqResources({ resources }: Props) {
  primeEnglishFaq(resources);
  return null;
}
