/**
 * Whether the signed-in user is allowed to edit a post.
 *
 * Authorship is the only rule. An edit is a comment operation broadcast under
 * the post's own author account, so nobody else can produce a valid one: the
 * instance owner seeing an Edit control on someone else's post only ever led to
 * a redirect. On a community instance any member can publish, and gating on
 * ownership instead of authorship locked those members out of their own posts.
 *
 * Author values reach this from two places: the route param, which carries the
 * `@` prefix used in post URLs, and `entry.author`, which does not.
 */
export function canEditEntry(
  username: string | null | undefined,
  author: string | null | undefined,
): boolean {
  const normalize = (value: string | null | undefined) =>
    (value ?? '').trim().replace(/^@/, '').toLowerCase();

  const user = normalize(username);
  return user.length > 0 && user === normalize(author);
}
