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
}
