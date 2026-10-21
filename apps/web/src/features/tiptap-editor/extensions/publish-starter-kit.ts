import { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

/**
 * StarterKit as the publish editor uses it.
 *
 * TipTap 3 added link, underline, listKeymap and trailingNode to StarterKit.
 * They are switched off so the editor keeps its TipTap 2 behaviour:
 * - link: the editor registers SafeLink, which strips unsafe hrefs. A second
 *   link mark from StarterKit would conflict with it.
 * - underline: markdown has no underline, so it would store raw <u> tags.
 * - trailingNode: appends an empty paragraph to every document, which
 *   changes the stored body.
 * - listKeymap: changes Tab and Backspace inside lists.
 * strike is replaced by DelStrike, which serialises to <del>.
 */
export const PublishStarterKit = StarterKit.configure({
  strike: false,
  link: false,
  underline: false,
  trailingNode: false,
  listKeymap: false
}) as AnyExtension;
