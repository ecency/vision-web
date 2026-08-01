import Link from '@tiptap/extension-link';

/**
 * Shared by the publish and edit editors so both round-trip links identically.
 *
 * Without this extension the schema has no link mark at all: loading a post
 * strips every href, and hand-typed markdown links are escaped by turndown into
 * literal text.
 *
 * openOnClick stays off so clicking a link inside the editor places the caret
 * instead of navigating away from an unsaved draft. autolink stays off because
 * the body is stored as markdown: linkifying bare URLs would rewrite every
 * plain "https://..." in the post into "[https://...](https://...)" on the
 * first edit, for no rendered difference. target and rel are cleared so the
 * editor's own display attributes never end up inside the stored body, which
 * happens for links that serialise back as raw HTML (aligned images, tables).
 *
 * javascript: and other dangerous URIs are rejected by the extension's default
 * validator, and DOMPurify already strips them while loading the post.
 */
export const LINK_EXTENSION = Link.configure({
  openOnClick: false,
  autolink: false,
  linkOnPaste: true,
  HTMLAttributes: { target: null, rel: null },
});
