export interface RenderOptions {
  /** When true, video embeds (3Speak, YouTube, etc.) render as iframes directly without a play button overlay. */
  embedVideosDirectly?: boolean;
  /**
   * When true, auto-linkified `@user` and `#tag` chips render as inert `<span>`
   * instead of `<a>`. Only affects the non-app render path, which is the only
   * one that emits these chips. For consumers that have no profile or tag
   * routes to send a reader to (a single-author self-hosted blog), an `<a>`
   * pointing at `/@user` or `/trending/tag` is a dead link that is still
   * focusable, announced as a link, and crawlable. Classes are unchanged so
   * existing chip styling still applies.
   */
  inertAuthorAndTagChips?: boolean;
  /**
   * Absolute origin for links a consumer has no route to serve itself, e.g.
   * `https://ecency.com`. Only affects the non-app render path.
   *
   * This is for PROFILE SECTION links, `/@user/wallet`, `/@user/followers` and
   * the rest of SECTION_LIST. They are emitted as ordinary links, so a
   * consumer whose only matching route is `/:author/:permlink` routes them as a
   * post and tries to load one whose permlink is `wallet`. That is not a dead
   * route, so no route guard catches it, and it is not a chip, so
   * `inertAuthorAndTagChips` does not either.
   *
   * Post links themselves are deliberately NOT rewritten: `/@author/permlink`
   * is real content the consumer can resolve from the chain, and keeping it
   * internal is the point of a self-hosted blog.
   */
  externalProfileBase?: string;
  /**
   * When true, author-supplied pixel `width` and `height` on a body `<img>`
   * are kept. Browsers map that pair to an aspect ratio, so a consumer whose
   * images are `max-width: 100%; height: auto` reserves the box before the
   * file loads. The default strips both attributes, which is what every
   * current consumer renders, so opting in is a layout change: the author's
   * pixel size becomes the reserved box (still capped by `max-width`).
   *
   * Only a unitless pair inside a sane range is kept. Percentages, a single
   * side, and `style` are not: `style` stays blocked outright, because it is
   * the attribute an author would use to inject CSS.
   */
  preserveImageDimensions?: boolean;
}
