import { CONFIG } from "@/modules/core";
import { callRPC } from "@/modules/core/hive-tx";
import { AccountRelationship, Profile } from "@/modules/accounts/types";
import { Community } from "@/modules/communities/types/community";
import { Subscription } from "@/modules/communities/types/subscription";
import { Entry } from "@/modules/posts/types";
import { filterDmcaEntry } from "@/modules/posts/utils/filter-dmca-entries";

type BridgeParams = Record<string, unknown> | unknown[];

export function bridgeApiCall<T>(endpoint: string, params: BridgeParams, signal?: AbortSignal): Promise<T> {
  return callRPC(`bridge.${endpoint}`, params, undefined, undefined, signal) as Promise<T>;
}

export async function resolvePost(
  post: Entry,
  observer: string,
  num?: number,
  signal?: AbortSignal
): Promise<Entry> {
  const { json_metadata: json } = post;

  if (json?.original_author && json?.original_permlink && json.tags?.[0] === "cross-post") {
    try {
      const resp = await getPost(
        json.original_author,
        json.original_permlink,
        observer,
        num,
        signal
      );
      if (resp) {
        return {
          ...post,
          original_entry: resp,
          num,
        };
      }
      return post;
    } catch {
      return post;
    }
  }

  return { ...post, num };
}

async function resolvePosts(posts: Entry[], observer: string, signal?: AbortSignal): Promise<Entry[]> {
  const validatedPosts = posts.map(validateEntry);
  const resolved = await Promise.all(validatedPosts.map((p) => resolvePost(p, observer, undefined, signal)));
  return filterDmcaEntry(resolved) as Entry[];
}

export async function getPostsRanked(
  sort: string,
  start_author: string = "",
  start_permlink: string = "",
  limit: number = 20,
  tag: string = "",
  observer: string = "",
  signal?: AbortSignal
): Promise<Entry[] | null> {
  const resp = await bridgeApiCall<Entry[] | null>("get_ranked_posts", {
    sort,
    start_author,
    start_permlink,
    limit,
    tag,
    observer,
  }, signal);

  if (Array.isArray(resp)) {
    return resolvePosts(resp, observer, signal);
  }

  if (resp != null) {
    console.warn(
      `[SDK] get_ranked_posts returned ${typeof resp} instead of an array for sort=${sort}; treating as no results.`
    );
  }

  return null;
}

export async function getAccountPosts(
  sort: string,
  account: string,
  start_author: string = "",
  start_permlink: string = "",
  limit: number = 20,
  observer: string = "",
  signal?: AbortSignal
): Promise<Entry[] | null> {
  if (CONFIG.dmcaAccounts.includes(account)) {
    return [];
  }

  const resp = await bridgeApiCall<Entry[] | null>("get_account_posts", {
    sort,
    account,
    start_author,
    start_permlink,
    limit,
    observer,
  }, signal);

  if (Array.isArray(resp)) {
    return resolvePosts(resp, observer, signal);
  }

  if (resp != null) {
    console.warn(
      `[SDK] get_account_posts returned ${typeof resp} instead of an array for account=${account}, sort=${sort}; treating as no results.`
    );
  }

  return null;
}

/**
 * Validates that an Entry object has required properties with non-null values.
 */
function validateEntry(entry: Entry): Entry {
  const newEntry: Entry = {
    ...entry,
    active_votes: Array.isArray(entry.active_votes) ? [...entry.active_votes] : [],
    beneficiaries: Array.isArray(entry.beneficiaries) ? [...entry.beneficiaries] : [],
    blacklists: Array.isArray(entry.blacklists) ? [...entry.blacklists] : [],
    replies: Array.isArray(entry.replies) ? [...entry.replies] : [],
    stats: entry.stats ? { ...entry.stats } : null,
  };

  const requiredStringProps: (keyof Entry)[] = [
    "author",
    "title",
    "body",
    "created",
    "category",
    "permlink",
    "url",
    "updated",
  ];

  for (const prop of requiredStringProps) {
    if (newEntry[prop] == null) {
      (newEntry as any)[prop] = "";
    }
  }

  if (newEntry.author_reputation == null) {
    newEntry.author_reputation = 0;
  }
  if (newEntry.children == null) {
    newEntry.children = 0;
  }
  if (newEntry.depth == null) {
    newEntry.depth = 0;
  }
  if (newEntry.net_rshares == null) {
    newEntry.net_rshares = 0;
  }
  if (newEntry.payout == null) {
    newEntry.payout = 0;
  }
  if (newEntry.percent_hbd == null) {
    newEntry.percent_hbd = 0;
  }

  if (!newEntry.stats) {
    newEntry.stats = {
      flag_weight: 0,
      gray: false,
      hide: false,
      total_votes: 0,
    };
  }

  if (newEntry.author_payout_value == null) {
    newEntry.author_payout_value = "0.000 HBD";
  }
  if (newEntry.curator_payout_value == null) {
    newEntry.curator_payout_value = "0.000 HBD";
  }
  if (newEntry.max_accepted_payout == null) {
    newEntry.max_accepted_payout = "1000000.000 HBD";
  }
  if (newEntry.payout_at == null) {
    newEntry.payout_at = "";
  }
  if (newEntry.pending_payout_value == null) {
    newEntry.pending_payout_value = "0.000 HBD";
  }
  if (newEntry.promoted == null) {
    newEntry.promoted = "0.000 HBD";
  }

  if (newEntry.is_paidout == null) {
    newEntry.is_paidout = false;
  }

  return newEntry;
}

export async function getPost(
  author: string = "",
  permlink: string = "",
  observer: string = "",
  num?: number,
  signal?: AbortSignal
): Promise<Entry | undefined> {
  const resp = await bridgeApiCall<Entry | null>("get_post", {
    author,
    permlink,
    observer,
  }, signal);

  if (resp) {
    const validatedEntry = validateEntry(resp);
    const post = await resolvePost(validatedEntry, observer, num, signal);
    return filterDmcaEntry(post) as Entry;
  }

  return undefined;
}

export async function getPostHeader(
  author: string = "",
  permlink: string = ""
): Promise<Entry | null> {
  const resp = await bridgeApiCall<Entry | null>("get_post_header", {
    author,
    permlink,
  });
  return resp ? validateEntry(resp) : resp;
}

export async function getDiscussion(
  author: string,
  permlink: string,
  observer?: string
): Promise<Record<string, Entry> | null> {
  const resp = await bridgeApiCall<Record<string, Entry> | null>("get_discussion", {
    author,
    permlink,
    observer: observer || author,
  });

  if (resp) {
    const validatedResp: Record<string, Entry> = {};
    for (const [key, entry] of Object.entries(resp)) {
      // Filtered as well as validated: a thread is served by .discussion.json
      // and rendered under every post, and a takedown covers a comment the
      // same way it covers the post it hangs under (#1862).
      validatedResp[key] = filterDmcaEntry(validateEntry(entry)) as Entry;
    }
    return validatedResp;
  }
  return resp;
}

export async function getCommunity(
  name: string,
  observer: string | undefined = ""
): Promise<Community | null> {
  return bridgeApiCall<Community | null>("get_community", { name, observer });
}

export async function getCommunities(
  last: string = "",
  limit: number = 100,
  query?: string | null,
  sort: string = "rank",
  observer: string = ""
): Promise<Community[] | null> {
  return bridgeApiCall<Community[] | null>("list_communities", {
    last,
    limit,
    query,
    sort,
    observer,
  });
}

export async function normalizePost(post: unknown): Promise<Entry | null> {
  const resp = await bridgeApiCall<Entry | null>("normalize_post", { post });
  return resp ? validateEntry(resp) : resp;
}

export async function getSubscriptions(account: string): Promise<Subscription[] | null> {
  return bridgeApiCall<Subscription[] | null>("list_all_subscriptions", { account });
}

export async function getSubscribers(community: string): Promise<Subscription[] | null> {
  return bridgeApiCall<Subscription[] | null>("list_subscribers", { community });
}

export async function getRelationshipBetweenAccounts(
  follower: string,
  following: string
): Promise<AccountRelationship | null> {
  return bridgeApiCall<AccountRelationship | null>("get_relationship_between_accounts", [
    follower,
    following,
  ]);
}

export async function getProfiles(
  accounts: string[],
  observer?: string
): Promise<Profile[]> {
  return bridgeApiCall<Profile[]>("get_profiles", { accounts, observer });
}
