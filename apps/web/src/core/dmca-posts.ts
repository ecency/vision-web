import dmcaPosts from "../../public/dmca/dmca-posts.json";

/**
 * The taken-down post list, with NO `@ecency/sdk` import.
 *
 * Deliberately a leaf below `core/dmca-lists`: a route handler that must not
 * pull the react-query SDK barrel into its bundle (the sitemap writer and the
 * Speak audio proxy both use the React-free `@ecency/sdk/hive` entry for that
 * reason) still has to answer "is this post taken down?". Without this the
 * answer had three separate representations in the app (#1862).
 *
 * Exact `@author/permlink`, matching how the SDK's filter compares: every entry
 * on the list is a canonical chain path, and the chain echoes author and
 * permlink lowercase, so callers normalise before asking.
 */
export const TAKEN_DOWN_POSTS: ReadonlySet<string> = new Set(dmcaPosts.posts ?? []);

/** Lists are published lowercase; a caller may hold whatever a URL carried. */
export const isTakenDownPost = (author: string, permlink: string): boolean =>
  TAKEN_DOWN_POSTS.has(`@${author.toLowerCase()}/${permlink.toLowerCase()}`);

/** The raw list, for the one caller that hands it to the SDK config. */
export const takenDownPostPaths = (): string[] => dmcaPosts.posts ?? [];
