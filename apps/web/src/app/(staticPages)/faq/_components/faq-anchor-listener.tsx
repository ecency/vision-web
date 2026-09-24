"use client";

import useMount from "react-use/lib/useMount";

export function FaqSearchListener({ searchResult }: { searchResult: string[] }) {
  useMount(() => {
    const { hash } = window.location;
    if (!hash) return;
    // FAQ keys are ids, not CSS selectors: a key with a space arrives
    // percent-encoded and a digit-leading hash is an invalid selector.
    try {
      document
        .getElementById(decodeURIComponent(hash.slice(1)))
        ?.scrollIntoView({ behavior: "smooth" });
    } catch {
      // Malformed percent-encoding: nothing to scroll to.
    }
  });

  return <></>;
}
