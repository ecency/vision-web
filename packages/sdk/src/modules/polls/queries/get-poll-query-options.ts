import { isServer, queryOptions } from "@tanstack/react-query";
import { CONFIG, QueryKeys, SERVER_GC_TIME_MS } from "@/modules/core";
import { getBoundFetch } from "@/modules/core/utils";
import type { Poll, PollChoice, PollVoter, PollStats } from "../types";

function normalizePoll(raw: Record<string, unknown>): Poll {
  const pollChoices = (raw.poll_choices as Record<string, unknown>[] | undefined) ?? [];
  const pollVoters = (raw.poll_voters as Record<string, unknown>[] | undefined) ?? [];
  const rawStats = raw.poll_stats as Record<string, unknown> | undefined;

  const choices: PollChoice[] = pollChoices.map((c) => {
    const votes = c.votes as Record<string, unknown> | undefined;
    return {
      choice_num: (c.choice_num as number) ?? 0,
      choice_text: (c.choice_text as string) ?? "",
      votes: votes
        ? {
            total_votes: (votes.total_votes as number) ?? 0,
            hive_hp: votes.hive_hp as number | undefined,
            hive_proxied_hp: votes.hive_proxied_hp as number | undefined,
            hive_hp_incl_proxied: (votes.hive_hp_incl_proxied as number | null) ?? null,
          }
        : undefined,
    };
  });

  const voters: PollVoter[] = pollVoters.map((v) => ({
    name: (v.name as string) ?? "",
    choices: (v.choices as number[]) ?? [],
    hive_hp: v.hive_hp as number | undefined,
    hive_proxied_hp: v.hive_proxied_hp as number | undefined,
    hive_hp_incl_proxied: v.hive_hp_incl_proxied as number | undefined,
  }));

  const stats: PollStats | undefined = rawStats
    ? {
        total_voting_accounts_num: (rawStats.total_voting_accounts_num as number) ?? 0,
        total_hive_hp: rawStats.total_hive_hp as number | undefined,
        total_hive_proxied_hp: rawStats.total_hive_proxied_hp as number | undefined,
        total_hive_hp_incl_proxied: (rawStats.total_hive_hp_incl_proxied as number | null) ?? null,
      }
    : undefined;

  return {
    author: (raw.author as string) ?? "",
    permlink: (raw.permlink as string) ?? "",
    question: (raw.question as string) ?? "",
    poll_choices: choices,
    poll_voters: voters,
    poll_stats: stats,
    poll_trx_id: (raw.poll_trx_id as string) ?? "",
    status: (raw.status as string) ?? "",
    end_time: (raw.end_time as string) ?? "",
    preferred_interpretation: (raw.preferred_interpretation as string) ?? "number_of_votes",
    max_choices_voted: (raw.max_choices_voted as number) ?? 1,
    filter_account_age_days: (raw.filter_account_age_days as number) ?? 0,
    protocol_version: (raw.protocol_version as number) ?? 0,
    created: (raw.created as string) ?? "",
    post_title: (raw.post_title as string) ?? "",
    post_body: (raw.post_body as string) ?? "",
    parent_permlink: (raw.parent_permlink as string) ?? "",
    tags: (raw.tags as string[]) ?? [],
    image: (raw.image as unknown[]) ?? [],
    token: raw.token as string | null | undefined,
    community_membership: raw.community_membership as string[] | undefined,
    allow_vote_changes: raw.allow_vote_changes as boolean | undefined,
    ui_hide_res_until_voted: (raw.ui_hide_res_until_voted as boolean | undefined) ?? false,
    platform: raw.platform as string | undefined,
  };
}

export function getPollQueryOptions(
  author: string | undefined,
  permlink: string | undefined
) {
  return queryOptions({
    queryKey: QueryKeys.polls.details(author ?? "", permlink ?? ""),
    enabled: !!author && !!permlink,
    // Long in a browser, where a poll is cheap to keep and often revisited;
    // bounded during SSR, where holding it also holds that request's whole
    // cache. See SERVER_GC_TIME_MS.
    gcTime: isServer ? SERVER_GC_TIME_MS : 30 * 60 * 1000,
    queryFn: async (): Promise<Poll> => {
      if (!author || !permlink) {
        throw new Error("[SDK][Polls] – missing author or permlink");
      }

      const fetchApi = getBoundFetch();
      const url = `${CONFIG.pollsApiHost}/rpc/poll?author=eq.${encodeURIComponent(author)}&permlink=eq.${encodeURIComponent(permlink)}`;
      const response = await fetchApi(url);

      if (!response.ok) {
        throw new Error(`[SDK][Polls] – fetch failed: ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data) || !data[0]) {
        throw new Error("[SDK][Polls] – no poll data found");
      }

      return normalizePoll(data[0]);
    },
  });
}
