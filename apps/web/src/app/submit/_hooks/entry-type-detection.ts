/**
 * Which submit route we are on, resolved synchronously and from the route
 * alone.
 *
 * Two things had to be true for the "don't restore the local draft over a
 * draft or an entry" guard to hold, and neither was:
 *
 * Both flags used to live in state filled from an effect, so every consumer saw
 * `false`/`false` for the first commit - and `useMount` callers read them in
 * exactly that commit.
 *
 * They also used to require an `activeUser`, which is loaded from localStorage
 * by a post-mount effect in client-init and is therefore *always* null on the
 * first render. That alone kept the guard open on every draft and entry route,
 * whatever the flags' timing.
 *
 * The route is fully determined by the path and its identifiers, so neither
 * dependency was needed. Being signed in is a separate concern, enforced where
 * the draft or entry is actually loaded.
 */
export function useEntryTypeDetection(
  path: string,
  username: string | undefined,
  permlink: string | undefined,
  draftId: string | undefined
) {
  const isEntry = path.endsWith("/edit") && !!username && !!permlink;
  const isDraft = path.startsWith("/draft") && !!draftId;

  return { isEntry, isDraft };
}
