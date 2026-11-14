import { Entry, WaveEntry } from "../types";
import { getDiscussionsQueryOptions, SortOrder } from "../queries/get-discussions-query-options";
import { CONFIG } from "@/modules/core";
import { entryKey, normalizeEntry } from "./normalize-entry";

function normalizeContainer(entry: Entry, host: string): WaveEntry {
  return {
    ...entry,
    id: entryKey(entry),
    // The private-api waves feeds send the publish time as `timestamp`, not `created`.
    created: entry.created ?? (entry as unknown as { timestamp?: string }).timestamp,
    host
  } as WaveEntry;
}

function normalizeParent(entry: Entry): Entry {
  return {
    ...entry,
    id: entryKey(entry)
  } as Entry;
}

export function normalizeWaveEntryFromApi(
  entry:
    | (Entry & { container?: Entry | null; parent?: Entry | null })
    | null
    | undefined,
  host: string
): WaveEntry | null {
  if (!entry) {
    return null;
  }

  const containerSource = entry.container ?? entry;
  const container = normalizeContainer(containerSource, host);

  const parent = entry.parent ? normalizeParent(entry.parent) : undefined;

  return {
    // Same vote contract as every other source: no raw voter list, and the
    // vote stated as unknown unless the row was normalized for someone.
    ...(normalizeEntry(entry, "") as typeof entry),
    id: entryKey(entry),
    // The private-api waves feeds (following / tag / account) send the publish
    // time as `timestamp`, not `created`; map it so the relative time renders on
    // every card (the For You feed already carries a real `created` from Hive RPC).
    created: entry.created ?? (entry as unknown as { timestamp?: string }).timestamp,
    // The private-api waves feeds omit max_accepted_payout; default it (and the
    // payout strings) to the Hive shape so payout-rendering consumers run their
    // pending+author+curator summation instead of treating the value as missing.
    max_accepted_payout: entry.max_accepted_payout || "1000000.000 HBD",
    pending_payout_value: entry.pending_payout_value || "0.000 HBD",
    author_payout_value: entry.author_payout_value || "0.000 HBD",
    curator_payout_value: entry.curator_payout_value || "0.000 HBD",
    host,
    container,
    parent
  } as WaveEntry;
}

export function toEntryArray(x: unknown): Entry[] {
  return Array.isArray(x) ? (x as Entry[]) : [];
}

export async function getVisibleFirstLevelThreadItems(
  container: WaveEntry
): Promise<Entry[]> {
  const queryOptions = getDiscussionsQueryOptions(container, SortOrder.created, true);
  const discussionItemsRaw = await CONFIG.queryClient.fetchQuery(queryOptions);
  const discussionItems = toEntryArray(discussionItemsRaw);

  if (discussionItems.length <= 1) {
    return [];
  }

  const firstLevelItems = discussionItems.filter(
    ({ parent_author, parent_permlink }) =>
      parent_author === container.author && parent_permlink === container.permlink
  );

  if (firstLevelItems.length === 0) {
    return [];
  }

  const visibleItems = firstLevelItems.filter((item) => !item.stats?.gray);

  return visibleItems;
}

export function mapThreadItemsToWaveEntries(
  items: Entry[],
  container: WaveEntry,
  host: string
): WaveEntry[] {
  if (items.length === 0) {
    return [];
  }

  return items
    .map((item) => {
      const parent = items.find(
        (i) =>
          i.author === item.parent_author &&
          i.permlink === item.parent_permlink &&
          i.author !== host
      );

      return {
        ...item,
        id: entryKey(item),
        host,
        container,
        parent
      } as WaveEntry;
    })
    .filter((entry) => entryKey(entry.container) !== entry.id)
    .sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
    );
}
