/**
 * Post filters are only meaningful for one instance type: a blog feed calls
 * bridge.get_account_posts, a community feed calls bridge.get_ranked_posts, and
 * the two APIs accept different sorts. Mixing them produces an instance whose
 * every tab errors, and resolvePostsFilter then clamps even an explicit
 * ?filter=... to the broken first entry.
 *
 * The hosting API pins instanceConfiguration.type from the stored config
 * (TenantService.applyConfigDocument) but persists whatever postsFilters the
 * client sends, so the editor must not save filters that contradict the type
 * the server is going to keep.
 */

export type InstanceType = 'blog' | 'community';

/** Sorts bridge.get_account_posts accepts. */
export const BLOG_POSTS_FILTERS: readonly string[] = [
  'blog',
  'feed',
  'posts',
  'comments',
  'replies',
  'payout',
];

/** Sorts bridge.get_ranked_posts accepts. */
export const COMMUNITY_POSTS_FILTERS: readonly string[] = [
  'trending',
  'hot',
  'created',
  'promoted',
  'payout',
  'muted',
];

/** What the editor fills in when the instance type changes. */
export const DEFAULT_POSTS_FILTERS: Record<InstanceType, readonly string[]> = {
  blog: ['blog', 'posts', 'comments', 'replies'],
  community: ['trending', 'hot', 'created'],
};

export function toInstanceType(value: unknown): InstanceType {
  return value === 'community' ? 'community' : 'blog';
}

export function defaultPostsFiltersFor(type: InstanceType): string[] {
  return [...DEFAULT_POSTS_FILTERS[type]];
}

function supportedFiltersFor(type: InstanceType): readonly string[] {
  return type === 'community' ? COMMUNITY_POSTS_FILTERS : BLOG_POSTS_FILTERS;
}

/**
 * Keep only the filters the given instance type can actually fetch. An empty
 * result would leave the instance with no feed at all, so it falls back to the
 * defaults for that type.
 */
export function sanitizePostsFiltersFor(
  type: InstanceType,
  filters: unknown,
): string[] {
  const supported = supportedFiltersFor(type);
  const valid = Array.isArray(filters)
    ? filters.filter(
        (filter): filter is string =>
          typeof filter === 'string' && supported.includes(filter),
      )
    : [];
  return valid.length > 0 ? valid : defaultPostsFiltersFor(type);
}

function sameFilters(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Force a config document to agree with the instance type the server owns:
 * the type is set back to the pinned value and any filter that type cannot
 * fetch is dropped. postsFilters is left alone when the document does not
 * carry it, so a save never invents settings the owner did not have.
 *
 * Returns the original document when it is already consistent.
 */
export function withPinnedInstanceType<T>(
  document: T,
  pinnedType: InstanceType,
): T {
  const doc = document as unknown as Record<string, unknown>;
  const configuration = doc?.configuration;
  if (typeof configuration !== 'object' || configuration === null) {
    return document;
  }

  const configurationRecord = configuration as Record<string, unknown>;
  const instance = configurationRecord.instanceConfiguration;
  if (typeof instance !== 'object' || instance === null) {
    return document;
  }

  const instanceRecord = instance as Record<string, unknown>;
  const features = instanceRecord.features;
  const featuresRecord =
    typeof features === 'object' && features !== null
      ? (features as Record<string, unknown>)
      : null;
  const currentFilters = featuresRecord?.postsFilters;

  const typeMatches = instanceRecord.type === pinnedType;
  const nextFilters = Array.isArray(currentFilters)
    ? sanitizePostsFiltersFor(pinnedType, currentFilters)
    : null;
  const filtersMatch =
    nextFilters === null ||
    sameFilters(currentFilters as unknown[], nextFilters);

  if (typeMatches && filtersMatch) return document;

  const nextInstance: Record<string, unknown> = {
    ...instanceRecord,
    type: pinnedType,
  };
  if (nextFilters !== null && featuresRecord) {
    nextInstance.features = { ...featuresRecord, postsFilters: nextFilters };
  }

  return {
    ...doc,
    configuration: {
      ...configurationRecord,
      instanceConfiguration: nextInstance,
    },
  } as unknown as T;
}
