"use client";

import useMount from "react-use/lib/useMount";

const AUTHOR_ID_PREFIX = "user-content-";

export function MdHandler() {
  const goToElementWhenActive = () => {
    // go to element when active page
    setTimeout(() => {
      const urlHash = location.hash;
      !!urlHash && goToElement(urlHash);
    }, 300);
  };

  // A post's own ids are namespaced by the renderer (`id="user-content-x"`,
  // so they cannot shadow the page's), and authors also anchor with
  // `data-id="x"`. A link to `#x` or `#user-content-x` finds either.
  const goToElement = (hashKey: string = "") => {
    let id = hashKey.replace(/^#/, "");
    try {
      id = decodeURIComponent(id);
    } catch {
      // keep the hash as written
    }
    if (!id) return;
    const base = id.startsWith(AUTHOR_ID_PREFIX) ? id.slice(AUTHOR_ID_PREFIX.length) : id;
    const byDataId = Array.from(document.querySelectorAll<HTMLElement>("[data-id]")).find(
      (el) => el.dataset.id === base
    );
    const target = byDataId ?? document.getElementById(AUTHOR_ID_PREFIX + base);
    target?.scrollIntoView({ behavior: "smooth" });
  };

  useMount(() => {
    goToElementWhenActive();
  });

  return <></>;
}
