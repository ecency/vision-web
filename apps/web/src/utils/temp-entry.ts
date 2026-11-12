import dayjs from "@/utils/dayjs";
import { Entry, FullAccount, JsonMetadata } from "@/entities";
import appPackage from "../../package.json";

export interface TempEntryProps {
  author: FullAccount;
  permlink: string;
  parentAuthor: string;
  parentPermlink: string;
  title: string;
  body: string;
  description: string | null;
  tags: string[];
  post_id?: string;
  jsonMeta?: JsonMetadata;
}

export const correctIsoDate = (d: string): string => d.split(".")[0];

export function tempEntry(p: TempEntryProps): Entry {
  const now = dayjs();
  const payout = dayjs().add(7, "day");

  const category = p.tags[0];

  return {
    // A post its author has just written: nobody, the author included, has
    // voted on it yet, so the vote button needs no lookup.
    observer_vote: null,
    observer_vote_for: p.author.name,
    author: p.author.name,
    author_payout_value: "0.000 HBD",
    author_reputation: Number(p.author.reputation!),
    beneficiaries: [],
    blacklists: [],
    body: p.body,
    category,
    children: 0,
    created: correctIsoDate(now.toISOString()),
    curator_payout_value: "0.000 HBD",
    depth: 0,
    is_paidout: false,
    json_metadata: p.jsonMeta ?? {
      app: `ecency/${appPackage.version}-vision`,
      format: "markdown+html",
      tags: p.tags,
      description: p.description
    },
    max_accepted_payout: "1000000.000 HBD",
    net_rshares: 0,
    payout: 0,
    payout_at: correctIsoDate(payout.toISOString()),
    pending_payout_value: "0.000 HBD",
    percent_hbd: 10000,
    permlink: p.permlink,
    post_id: p.post_id ?? 1,
    promoted: "0.000 HBD",
    replies: [],
    stats: { flag_weight: 0, gray: false, hide: false, total_votes: 0 },
    title: p.title,
    updated: correctIsoDate(now.toISOString()),
    url: `/@${p.author.name}/${p.permlink}`,
    parent_author: p.parentAuthor,
    parent_permlink: p.parentPermlink
  };
}
