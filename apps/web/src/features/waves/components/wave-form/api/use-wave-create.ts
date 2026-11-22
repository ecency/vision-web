"use client";

import { InfiniteData, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAccountPostsQueryOptions, QueryKeys } from "@ecency/sdk";
import { ProfileFilter } from "@/enums";
import i18next from "i18next";
import { error } from "@/features/shared";
import { formatError } from "@/api/format-error";
import { reportRcRejection } from "@/api/rc-shortfall-report";
import { useActiveUsername } from "@/core/hooks/use-active-username";
import { useWavesApi } from "./use-waves-api";
import { useCommunityApi } from "./use-community-api";
import { ECENCY_WAVES_HOSTS, isEcencyWavesHost } from "@/features/waves/enums/wave-hosts";
import { Entry, WaveEntry } from "@/entities";
import { DecentMemesPayload } from "@/api/decentmemes";

export function useWaveCreate() {
  const queryClient = useQueryClient();
  const username = useActiveUsername();

  const { mutateAsync: generalApiRequest } = useWavesApi();
  const { mutateAsync: communityBasedApiRequest } = useCommunityApi();

  return useMutation({
    mutationKey: ["wave-create"],
    mutationFn: async ({
      host,
      raw,
      editingEntry,
      videoThumbnail,
      decentMemes
    }: {
      host: string;
      raw: string;
      editingEntry?: WaveEntry;
      videoThumbnail?: string;
      decentMemes?: DecentMemesPayload;
    }) => {
      if (host === "dbuzz") {
        return {
          host,
          entry: (await communityBasedApiRequest({
            host,
            raw,
            editingEntry,
            videoThumbnail
          })) as WaveEntry
        };
      }

      // Resolve which container account to publish into and its latest anchor
      // post. For Ecency's own waves (the standard composer), prefer hive.flow
      // and fall back to ecency.waves: walk ECENCY_WAVES_HOSTS and take the
      // first host that currently has a live anchor post. hive.flow is inert
      // today, so this is ecency.waves until it launches, then switches over
      // automatically. Explicit non-Ecency hosts (decks: leothreads /
      // liketu.moments / ...) are used as requested.
      let resolvedHost = host;
      let entry: Entry | undefined;
      let lastError: unknown;

      if (isEcencyWavesHost(host)) {
        for (const candidate of ECENCY_WAVES_HOSTS) {
          try {
            const entries = await queryClient.fetchQuery(
              getAccountPostsQueryOptions(candidate, ProfileFilter.posts)
            );
            if (entries && entries.length > 0) {
              resolvedHost = candidate;
              entry = entries[0];
              break;
            }
          } catch (e) {
            // hive.flow is pre-provisioned and may not resolve yet, so tolerate
            // its failure and try the next preferred container. Remember the
            // error so a genuine outage on the fallback (ecency.waves) is
            // surfaced rather than masked as a missing host.
            lastError = e;
          }
        }
      } else {
        const hostEntries = await queryClient.fetchQuery(
          getAccountPostsQueryOptions(host, ProfileFilter.posts)
        );
        entry = hostEntries?.[0];
      }

      if (!entry) {
        if (lastError) {
          throw lastError;
        }
        throw new Error(i18next.t("decks.threads-form.no-threads-host"));
      }

      return {
        host: resolvedHost,
        entry: (await generalApiRequest({
          entry,
          raw,
          editingEntry,
          host: resolvedHost,
          videoThumbnail,
          decentMemes
        })) as WaveEntry,
        isEditing: !!editingEntry
      };
    },
    // The account that submitted, kept for the error: the active account can
    // be switched while the broadcast is pending.
    onMutate: () => ({ username }),
    onSuccess: ({ host, entry, isEditing }) => {
      if (isEditing) {
        return;
      }

      const prependToFirstPage = (data?: InfiniteData<WaveEntry[]>) => {
        if (!data) {
          return data;
        }

        // Skip if the wave is already in the cache (e.g. the 60s auto-refresh
        // poll already rewrote page 0), so we never render it twice. A wave is
        // uniquely identified by author + permlink (entry.id is not reliable).
        const alreadyPresent = data.pages.some((page) =>
          page.some(
            (existing) => existing.author === entry.author && existing.permlink === entry.permlink
          )
        );

        if (alreadyPresent) {
          return data;
        }

        return {
          ...data,
          pages: data.pages.map((page, index) => (index === 0 ? [entry, ...page] : page))
        };
      };

      // The live Waves list is now the combined cross-container feed; show the
      // new wave at the top of it immediately.
      queryClient.setQueryData<InfiniteData<WaveEntry[]>>(
        QueryKeys.posts.wavesFeed({}),
        prependToFirstPage
      );
      // Legacy single-host feed (decks) kept in sync.
      queryClient.setQueryData<InfiniteData<WaveEntry[]>>(
        QueryKeys.posts.wavesByHost(host),
        prependToFirstPage
      );
    },
    onError: (e, { host }, context) => {
      // dbuzz waves are root posts; every other host takes a reply.
      reportRcRejection(e, host === "dbuzz" ? "post" : "comment", context?.username);
      error(...formatError(e));
    }
  });
}
