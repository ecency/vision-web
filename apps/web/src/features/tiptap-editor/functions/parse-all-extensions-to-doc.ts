import {
  HIVE_POST_PURE_REGEX,
  LOOM_REGEX,
  TAG_MENTION_PURE_REGEX,
  USER_MENTION_PURE_REGEX,
  YOUTUBE_REGEX
} from "../extensions";

export function parseAllExtensionsToDoc(value?: string) {
  const tree = document.createElement("body");
  tree.innerHTML = value ?? "";

  // Handle 3speak videos
  (Array.from(tree.querySelectorAll("a[href]").values()) as HTMLElement[])
    .filter((el) => el.getAttribute("href")?.includes("3speak.tv"))
    .forEach((el) => {
      const image = el.querySelector("img");
      const newEl = document.createElement("div");

      newEl.dataset.threeSpeakVideo = "";
      newEl.setAttribute("src", el.getAttribute("href") ?? "");
      newEl.setAttribute("thumbnail", image?.getAttribute("src") ?? "");
      newEl.setAttribute("status", "published");

      el.parentElement?.replaceChild(newEl, el);
    });

  // Handle YouTube videos
  (Array.from(tree.querySelectorAll("a[href]").values()) as HTMLElement[])
    .filter((el) => {
      const href = el.getAttribute("href") ?? "";
      YOUTUBE_REGEX.lastIndex = 0;
      return YOUTUBE_REGEX.test(href);
    })
    .forEach((el) => {
      const image = el.querySelector("img");
      const href = el.getAttribute("href") ?? "";
      const id = href.match(YOUTUBE_REGEX)?.[1] ?? "";
      const newEl = document.createElement("div");
      newEl.dataset.youtubeVideo = "";
      newEl.setAttribute("src", href);
      newEl.setAttribute(
        "thumbnail",
        image?.getAttribute("src") ?? (id ? `https://img.youtube.com/vi/${id}/0.jpg` : "")
      );

      const parent = el.parentElement;
      if (parent?.tagName === "CENTER") {
        newEl.style.textAlign = "center";
        parent.parentElement?.replaceChild(newEl, parent);
      } else if (parent && parent.style.textAlign) {
        newEl.style.textAlign = parent.style.textAlign;
        parent.parentElement?.replaceChild(newEl, parent);
      } else {
        el.parentElement?.replaceChild(newEl, el);
      }
    });

  // Handle Loom videos
  (Array.from(tree.querySelectorAll("a[href]").values()) as HTMLElement[])
    .filter((el) => {
      const href = el.getAttribute("href") ?? "";
      LOOM_REGEX.lastIndex = 0;
      return LOOM_REGEX.test(href);
    })
    .forEach((el) => {
      const image = el.querySelector("img");
      const href = el.getAttribute("href") ?? "";
      const id = href.match(LOOM_REGEX)?.[2] ?? "";
      const newEl = document.createElement("div");
      newEl.dataset.loomVideo = "";
      newEl.setAttribute("src", href);
      newEl.setAttribute(
        "thumbnail",
        image?.getAttribute("src") ?? (id ? `https://img.loom.com/vi/${id}/0.jpg` : "")
      );

      const parent = el.parentElement;
      if (parent?.tagName === "CENTER") {
        newEl.style.textAlign = "center";
        parent.parentElement?.replaceChild(newEl, parent);
      } else if (parent && parent.style.textAlign) {
        newEl.style.textAlign = parent.style.textAlign;
        parent.parentElement?.replaceChild(newEl, parent);
      } else {
        el.parentElement?.replaceChild(newEl, el);
      }
    });

  // Handle hive posts
  (Array.from(tree.querySelectorAll("a[href]").values()) as HTMLElement[])
    .filter((el) => {
      const href = el.getAttribute("href") ?? "";
      HIVE_POST_PURE_REGEX.lastIndex = 0;
      return HIVE_POST_PURE_REGEX.test(href) && el.innerText.trim() === href;
    })
    .forEach((el) => {
      const newEl = document.createElement("div");
      newEl.dataset.hivePost = "";
      newEl.setAttribute("href", el.getAttribute("href") ?? "");

      el.parentElement?.replaceChild(newEl, el);
    });

  // Handle mentions
  // We cannot use :has selector because some browsers like Safari 15 doesn't support it well
  // Skip code/pre elements so backtick-wrapped text like `@aws-sdk` stays as plain text
  (Array.from(tree.querySelectorAll("*:not(a):not(code):not(pre)")) as HTMLElement[])
    .filter((el) => !el.closest("code") && !el.closest("pre") && !el.querySelector("a") && USER_MENTION_PURE_REGEX.test(el.innerText))
    .forEach((el) => {
      el.innerHTML = el.innerHTML.replace(
        USER_MENTION_PURE_REGEX,
        (match) => `<span data-type="mention" data-id=${match.replace("@", "")}></span>`
      );
    });

  // Handle tags
  // We cannot use :has selector because some browsers like Safari 15 doesn't support it well
  // Skip code/pre elements so backtick-wrapped text like `#tag` stays as plain text
  (Array.from(tree.querySelectorAll("*:not(a):not(code):not(pre)")) as HTMLElement[])
    .filter((el) => !el.closest("code") && !el.closest("pre") && !el.querySelector("a") && TAG_MENTION_PURE_REGEX.test(el.innerText))
    .forEach((el) => {
      el.innerHTML = el.innerHTML.replace(
        TAG_MENTION_PURE_REGEX,
        (match) => `<span data-type="tag" data-id=${match.replace("#", "")} /></span>`
      );
    });

  // Handle image alignment wrappers
  (Array.from(tree.querySelectorAll("div.pull-left, div.pull-right")) as HTMLElement[]).forEach(
    (el) => {
      const img = el.querySelector("img");
      if (img) {
        const cls = el.classList.contains("pull-left") ? "pull-left" : "pull-right";
        img.setAttribute("class", cls);
        el.parentElement?.replaceChild(img, el);
      }
    }
  );

  (Array.from(tree.querySelectorAll("center")) as HTMLElement[]).forEach((el) => {
    const img = el.querySelector("img");
    if (img) {
      const p = document.createElement("p");
      p.style.textAlign = "center";
      p.appendChild(img);
      el.parentElement?.replaceChild(p, el);
    }
  });

  // Convert data-align attributes to style.textAlign for TipTap's TextAlign extension
  (Array.from(tree.querySelectorAll("[data-align]")) as HTMLElement[]).forEach((el) => {
    const align = el.getAttribute("data-align");
    if (align && !el.style.textAlign) {
      el.style.textAlign = align;
    }
    el.removeAttribute("data-align");
  });

  // Ensure list items have a paragraph before nested lists to satisfy ProseMirror schema
  (Array.from(tree.querySelectorAll("li")) as HTMLElement[]).forEach((li) => {
    const first = li.firstElementChild;
    if (first && (first.tagName === "OL" || first.tagName === "UL")) {
      const p = document.createElement("p");
      li.insertBefore(p, first);
    }
  });

  // Ensure empty blockquotes have at least one paragraph to satisfy ProseMirror schema.
  // Blockquotes with bare text are left alone — the editor wraps that text in a paragraph itself.
  (Array.from(tree.querySelectorAll("blockquote")) as HTMLElement[]).forEach((bq) => {
    if (!bq.firstElementChild && !bq.textContent?.trim()) {
      bq.appendChild(document.createElement("p"));
    }
  });

  // Same problem, same fix, for table cells. A markdown table may legitimately
  // leave a cell blank, which renders as <td></td>, but the ProseMirror
  // tableCell schema requires at least one block child and rejects the whole
  // insert with "Invalid content for node tableCell: <>". Because insertContent
  // throws, NOTHING is pasted: the table does not appear at all, rather than
  // appearing with a gap. One blank cell anywhere is enough to lose the table.
  // Replace rather than append: the guard also matches cells holding only
  // whitespace or &nbsp;, which the browser already renders as one paragraph.
  // Appending to those would leave the invisible text AND an empty paragraph
  // behind, doubling the cell's height for no visible reason.
  (Array.from(tree.querySelectorAll("td, th")) as HTMLElement[]).forEach((cell) => {
    if (!cell.firstElementChild && !cell.textContent?.trim()) {
      cell.textContent = "";
      cell.appendChild(document.createElement("p"));
    }
  });

  return tree.innerHTML;
}
