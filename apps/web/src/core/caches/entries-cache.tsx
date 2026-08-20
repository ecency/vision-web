import { getQueryClient } from "../react-query";
import {
  getNormalizePostQueryOptions,
  getPostQueryOptions,
  QueryKeys
} from "@ecency/sdk";
import { Entry, EntryVote } from "@/entities";
import { makeEntryPath } from "@/utils";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { DEFAULT_OBSERVER } from "@/consts/observer";

// Deliberately observer-free. Every entry read below pins the observer to
// DEFAULT_OBSERVER for server and client alike, so there is exactly one cached
// shape per post and this key stays stable. That matters: ~57 call sites write
// through these helpers (optimistic vote and reply updates among them), and an
// observer dimension in the key would silently split those writes away from the
// entry the page is actually rendering. Personalising a single entry would mean
// threading the observer through all of them; the comment thread already
// personalises via getDiscussionsQueryOptions, which is where mute filtering
// actually earns its keep on an entry page.
function entryKey(author: string, permlink: string) {
  return QueryKeys.posts.entry(makeEntryPath("", author, permlink));
}

export namespace EcencyEntriesCacheManagement {
  export function getEntryQueryByPath(author?: string, permlink?: string) {
    return {
      ...getPostQueryOptions(author ?? "", permlink, DEFAULT_OBSERVER),
      queryKey: entryKey(author ?? "", permlink ?? ""),
      enabled: typeof author === "string" && typeof permlink === "string" && !!author && !!permlink,
      // getPostQueryOptions resolves to `Entry | null`. Callers treat a missing
      // post the same way they treat "not loaded yet", so normalise the null
      // away here instead of making every call site handle both.
      select: (data: Entry | null | undefined) => data ?? undefined
    };
  }

  export function getEntryQuery<T extends Entry>(initialEntry?: T) {
    return {
      ...getPostQueryOptions(
        initialEntry?.author ?? "",
        initialEntry?.permlink,
        DEFAULT_OBSERVER
      ),
      queryKey: entryKey(initialEntry?.author ?? "", initialEntry?.permlink ?? ""),
      initialData: initialEntry,
      // Feed cards seed this shared post cache so their vote/payout/reblog
      // controls read one entry, and a slim row (body "") would otherwise sit
      // here looking like a freshly fetched post for the full staleTime: opening
      // that post could then render an empty article. Stamping the seed as
      // never-updated keeps the cards working while marking it stale from the
      // start, so the entry page's own fetch always wins on hydration and an
      // explicit refetch (edit prefill, translate) reaches the network.
      // `refetchOnMount` is false app-wide, so this does NOT make the 20 cards
      // on a feed page fetch anything.
      initialDataUpdatedAt: initialEntry && initialEntry.body === "" ? 0 : undefined,
      enabled: !!initialEntry,
      // Spreading getPostQueryOptions pulls in its `Entry | null` result, which
      // otherwise overrides this helper's own generic: callers lost the entry
      // subtype they passed in (ThreadItemEntry's host/container, for example)
      // and had to cope with a null they never expect.
      //
      // initialData carries the subtype, but a background refetch resolves a
      // plain Entry, so the subtype-only fields would drop out from under
      // callers that read them. Layering the refetched entry over the initial
      // one keeps those fields while every field the server does return still
      // wins, which makes the subtype the result actually has. react-query
      // applies structural sharing to select output, so an unchanged entry
      // keeps its previous reference rather than re-rendering consumers.
      select: (data: Entry | null | undefined) =>
        data ? ({ ...initialEntry, ...data } as T) : undefined
    };
  }

  export function getNormalizedPostQuery<T extends Entry>(entry?: T) {
    return {
      ...getNormalizePostQueryOptions(entry),
      queryKey: QueryKeys.posts.normalize(entry?.author ?? "", entry?.permlink ?? ""),
      enabled: !!entry
    };
  }

  export function useAddReply(initialEntry?: Entry) {
    const qc = useQueryClient();

    return {
      addReply: (reply: Entry, entry = initialEntry) => {
        mutateEntryInstance(
          entry,
          (value) => ({
            ...value,
            children: value.children + 1,
            replies: [reply, ...value.replies]
          }),
          qc
        );
      }
    };
  }

  export function useUpdateRepliesCount(initialEntry?: Entry) {
    const qc = useQueryClient();

    return {
      updateRepliesCount: (count: number, entry = initialEntry) => {
        mutateEntryInstance(
          entry,
          (value) => ({
            ...value,
            children: count
          }),
          qc
        );
      }
    };
  }

  export function useInvalidation(entry?: Entry | null) {
    const qc = useQueryClient();
    return {
      invalidate: () => {
        if (entry) {
          qc.invalidateQueries({
            queryKey: entryKey(entry.author, entry.permlink)
          });
        }
      }
    };
  }

  export function useUpdateVotes(entry?: Entry | null) {
    const qc = useQueryClient();
    return {
      // `totalVotes` lets callers pass an explicit count. Feed-sourced entries
      // (e.g. the unified waves feed) ship a `net_votes` count but no
      // `active_votes` array, so `votes.length` understates the real total; the
      // caller derives the correct next count and passes it here.
      update: (votes: EntryVote[], payout: number, totalVotes?: number) => {
        if (!entry) return;
        const nextTotalVotes = totalVotes ?? votes.length;
        mutateEntryInstance(
          entry,
          (value) => ({
            ...value,
            active_votes: votes,
            stats: {
              ...entry.stats || { gray: false, hide: false, flag_weight: 0, total_votes: 0 },
              total_votes: nextTotalVotes,
              flag_weight: entry?.stats?.flag_weight || 0
            },
            total_votes: nextTotalVotes,
            net_votes: nextTotalVotes,
            payout,
            pending_payout_value: String(payout)
          }),
          qc
        );
      }
    };
  }

  export function useUpdateEntry() {
    const qc = useQueryClient();

    const updateEntryQueryDataFn = useCallback(
      (entries: Entry[]) => updateEntryQueryData(entries, qc),
      [qc]
    );

    return {
      updateEntryQueryData: updateEntryQueryDataFn
    };
  }

  export function useUpdateReblogsCount(entry: Entry) {
    const qc = useQueryClient();
    return {
      update: (count: number) => {
        mutateEntryInstance(
          entry,
          (value) => ({
            ...value,
            reblogs: count
          }),
          qc
        );
      }
    };
  }

  export function updateEntryQueryData(entries: Entry[], qc: QueryClient = getQueryClient()) {
    entries.forEach((entry) => {
      qc.setQueryData<Entry>(
        entryKey(entry.author, entry.permlink),
        () => entry
      );
    });
  }

  function mutateEntryInstance(
    entry: Entry | undefined,
    callback: (value: Entry) => Entry,
    qc: QueryClient = getQueryClient()
  ) {
    if (!entry) {
      throw new Error("Mutate entry instance – entry not provided");
    }

    const actualEntryValue = qc.getQueryData<Entry>(
      entryKey(entry.author, entry.permlink)
    );
    const value = callback(actualEntryValue ?? entry);
    return updateEntryQueryData([value], qc);
  }
}
