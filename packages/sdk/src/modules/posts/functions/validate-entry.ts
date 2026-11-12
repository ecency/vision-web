import { Entry } from "../types";

export function validateEntry(entry: Entry): Entry {
  // List of required string properties that must not be null/undefined
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

  // Check and fix null/undefined string properties
  for (const prop of requiredStringProps) {
    if (entry[prop] == null) {
      console.warn(
        `Entry validation: ${prop} is null/undefined for @${entry.author || "unknown"}/${entry.permlink || "unknown"}, setting to empty string`
      );
      (entry as any)[prop] = "";
    }
  }

  // Ensure numeric properties have sensible defaults
  if (entry.author_reputation == null) {
    console.warn(
      `Entry validation: author_reputation is null/undefined for @${entry.author}/${entry.permlink}, setting to 0`
    );
    entry.author_reputation = 0;
  }
  if (entry.children == null) {
    entry.children = 0;
  }
  if (entry.depth == null) {
    entry.depth = 0;
  }
  if (entry.net_rshares == null) {
    entry.net_rshares = 0;
  }
  if (entry.payout == null) {
    entry.payout = 0;
  }
  if (entry.percent_hbd == null) {
    entry.percent_hbd = 0;
  }

  // Ensure array properties are arrays
  // active_votes is NOT defaulted: bridge v2 reads carry no voter list, and
  // an empty array would read as "nobody voted" (see normalizeEntry).
  if (!Array.isArray(entry.beneficiaries)) {
    entry.beneficiaries = [];
  }
  if (!Array.isArray(entry.blacklists)) {
    entry.blacklists = [];
  }
  if (!Array.isArray(entry.replies)) {
    entry.replies = [];
  }

  // Ensure object properties have defaults
  if (!entry.stats) {
    entry.stats = {
      flag_weight: 0,
      gray: false,
      hide: false,
      total_votes: 0,
    };
  }

  // Ensure string properties that have specific defaults
  if (entry.author_payout_value == null) {
    entry.author_payout_value = "0.000 HBD";
  }
  if (entry.curator_payout_value == null) {
    entry.curator_payout_value = "0.000 HBD";
  }
  if (entry.max_accepted_payout == null) {
    entry.max_accepted_payout = "1000000.000 HBD";
  }
  if (entry.payout_at == null) {
    entry.payout_at = "";
  }
  if (entry.pending_payout_value == null) {
    entry.pending_payout_value = "0.000 HBD";
  }
  if (entry.promoted == null) {
    entry.promoted = "0.000 HBD";
  }

  // Ensure boolean properties have defaults
  if (entry.is_paidout == null) {
    entry.is_paidout = false;
  }

  return entry;
}
