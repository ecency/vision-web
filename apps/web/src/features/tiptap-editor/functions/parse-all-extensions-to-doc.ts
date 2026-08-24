import {
  HIVE_POST_PURE_REGEX,
  LOOM_REGEX,
  TAG_MENTION_PURE_REGEX,
  USER_MENTION_PURE_REGEX,
  YOUTUBE_REGEX
} from "../extensions";

/**
 * Elements the editor schema turns into a BLOCK node. A list item may hold these,
 * but not as its first child, because listItem is "paragraph block*".
 */
const LEADING_BLOCK = [
  "ol",
  "ul",
  "blockquote",
  "pre",
  "hr",
  "table",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "div[data-youtube-video]",
  "div[data-three-speak-video]",
  "div[data-loom-video]",
  "div[data-hive-post]"
].join(", ");

/**
 * Every element the schema turns into a node, block or inline, so an element
 * holding one of these renders as something and must not be blanked.
 *
 * ⚠️ These MUST mirror the extensions' own parse rules, tag and attributes both.
 * Anything not listed here parses to NOTHING: raw <iframe>, <video> and <audio>
 * have no node in this editor, and neither does an <img> without a usable src,
 * which is why Image's exact rule is reproduced rather than a bare "img". Listing
 * something the schema does not parse leaves the container schema-empty, and
 * insertContent then throws away the user's entire paste.
 */
const RENDERS_AS_NODE = [
  LEADING_BLOCK,
  "p",
  // @tiptap/extension-image, allowBase64 defaults to false
  'img[src]:not([src^="data:"])',
  "br",
  'span[data-type="mention"]',
  'span[data-type="tag"]'
].join(", ");

/**
 * What survives when an invalid container is unwrapped: its elements, plus text
 * that is actually visible. Whitespace-only text is dropped, or unwrapping a list
 * that held nothing but spaces would leave them behind as a blank paragraph.
 */
function keptOnUnwrap(el: Element) {
  return Array.from(el.childNodes).filter(
    (node) => node.nodeType === Node.ELEMENT_NODE || node.textContent?.trim()
  );
}

/** True when the element holds nothing the schema would render. */
function holdsNothingRenderable(el: Element) {
  return !el.textContent?.trim() && !el.querySelector(RENDERS_AS_NODE);
}

/** True when the item holds visible text ahead of the given child. */
function hasTextBefore(child: Element) {
  let node: ChildNode | null = child.previousSibling;
  while (node) {
    if (node.textContent?.trim()) {
      return true;
    }
    node = node.previousSibling;
  }
  return false;
}

/** Elements whose text must stay literal. */
const CHIP_EXCLUDED = "a, code, pre";

/**
 * Turns every `@name` / `#tag` occurrence into a chip span, editing TEXT NODES only.
 *
 * ⛔ Do not go back to `el.innerHTML.replace(...)`. innerHTML carries attribute
 * values, so the replacement also fires inside `src` and `href`, and Hive image
 * URLs contain `/@author/`: pasting a mention beside a hosted image used to tear
 * the <img> tag apart and leak its tail into the document as text. Nothing throws,
 * so the author simply loses the image.
 *
 * Working on text nodes also drops the need for `el.innerText`, which does not
 * exist in jsdom and made this pass silently inert under test.
 */
function chipTextNodes(root: HTMLElement, regex: RegExp, type: "mention" | "tag") {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    // A global regex carries lastIndex between calls, so a shared instance would
    // start mid-string and miss matches. Reset before every use.
    regex.lastIndex = 0;
    if (!node.parentElement?.closest(CHIP_EXCLUDED) && regex.test(node.data)) {
      targets.push(node);
    }
  }

  targets.forEach((node) => {
    const fragment = document.createDocumentFragment();
    const text = node.data;
    let index = 0;
    let match: RegExpExecArray | null;

    regex.lastIndex = 0;
    while ((match = regex.exec(text))) {
      if (match.index > index) {
        fragment.appendChild(document.createTextNode(text.slice(index, match.index)));
      }

      const chip = document.createElement("span");
      chip.setAttribute("data-type", type);
      chip.setAttribute("data-id", match[0].slice(1));
      fragment.appendChild(chip);

      index = match.index + match[0].length;
      // A zero-length match would spin forever otherwise.
      if (match[0].length === 0) {
        regex.lastIndex += 1;
      }
    }

    if (index < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(index)));
    }

    node.replaceWith(fragment);
  });
}

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

  // Handle mentions and tags.
  // Skip code/pre so backtick-wrapped text like `@aws-sdk` or `#tag` stays plain,
  // and skip anchors so a link whose text is a mention keeps working as a link.
  chipTextNodes(tree, USER_MENTION_PURE_REGEX, "mention");
  chipTextNodes(tree, TAG_MENTION_PURE_REGEX, "tag");

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

  // A list with no item, and a table with no row, are invalid the same way an empty
  // item is: bulletList and orderedList are "listItem+", table is "tableRow+". The
  // paste throws and the user loses everything, not just the empty container.
  // Both render as nothing, so unwrap the list (which keeps a nested list that was
  // its only child) and drop the table. This has to run BEFORE the item repair
  // below so an item left empty here still gets its paragraph.
  (Array.from(tree.querySelectorAll("ul, ol")) as HTMLElement[]).forEach((list) => {
    const hasItem = Array.from(list.children).some((child) => child.tagName === "LI");
    if (!hasItem) {
      list.replaceWith(...keptOnUnwrap(list));
    }
  });

  // Unwrap the table too rather than dropping it: a rowless one can still hold a
  // caption, and that text is the author's.
  (Array.from(tree.querySelectorAll("table")) as HTMLElement[]).forEach((table) => {
    if (!table.querySelector("tr")) {
      table.replaceWith(...keptOnUnwrap(table));
    }
  });

  // ProseMirror's listItem schema is "paragraph block*", so an item's FIRST child
  // has to be a paragraph. Markdown routinely produces items that break that rule,
  // and insertContent throws for the whole paste rather than for the one bad item,
  // so a single one of these silently loses everything the user pasted:
  //   <li></li>                     an empty item, reported as "listItem: <>"
  //   <li><ul>...</ul></li>         a nested list with no lead-in
  //   <li><h2>x</h2></li>           "- one" followed by an indented "-" reads as a setext heading
  //   <li><blockquote>|<pre>|<hr>|<table>
  //   <li><div data-youtube-video>  the embeds this file substitutes for a bare link above
  // Prepending an empty paragraph keeps the content and satisfies the schema.
  (Array.from(tree.querySelectorAll("li")) as HTMLElement[]).forEach((li) => {
    // Step over leading elements the schema drops entirely, so a block hiding
    // behind something like an empty <span> still counts as leading the item.
    // Cheap matches() first: textContent walks the whole nested subtree.
    let first = li.firstElementChild;
    while (first && !first.matches(RENDERS_AS_NODE) && !first.textContent?.trim()) {
      first = first.nextElementSibling;
    }

    // Only when the block leads the item. Text before it already becomes the
    // required paragraph, and prepending another one there just adds a blank line.
    if (first && first.matches(LEADING_BLOCK) && !hasTextBefore(first)) {
      li.insertBefore(document.createElement("p"), first);
      return;
    }

    // An item with nothing to render, which is the "listItem: <>" case. Replace
    // rather than append: the guard also matches items holding only whitespace or
    // &nbsp;, which the browser already renders as one paragraph, and appending
    // would leave the invisible text AND an empty paragraph behind. Elements that
    // carry no text but still produce a node keep the item non-empty.
    if (holdsNothingRenderable(li)) {
      li.textContent = "";
      li.appendChild(document.createElement("p"));
    }
  });

  // Ensure empty blockquotes have at least one paragraph to satisfy ProseMirror schema.
  // Blockquotes with bare text are left alone — the editor wraps that text in a paragraph itself.
  // The test is "renders as nothing", not "has no element child": a blockquote holding only an
  // element the schema drops, such as `> <iframe src=x></iframe>`, is just as empty to ProseMirror.
  (Array.from(tree.querySelectorAll("blockquote")) as HTMLElement[]).forEach((bq) => {
    if (holdsNothingRenderable(bq)) {
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
    if (holdsNothingRenderable(cell)) {
      cell.textContent = "";
      cell.appendChild(document.createElement("p"));
    }
  });

  return tree.innerHTML;
}
