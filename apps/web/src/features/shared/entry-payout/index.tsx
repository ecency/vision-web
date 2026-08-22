"use client";

import React, { useRef, useState } from "react";
import { Popover, PopoverContent } from "@ui/popover";
import { EntryPayoutDetail } from "@/features/shared/entry-payout/entry-payout-detail";
import { parseAsset } from "@/utils";
import { FormattedCurrency } from "@/features/shared";
import { classNameObject } from "@ui/util";
import { Entry } from "@/entities";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useQuery } from "@tanstack/react-query";

interface Props {
  entry: Entry;
}

export const EntryPayout = ({ entry: initialEntry }: Props) => {
  const [showPopover, setShowPopover] = useState(false);

  // Subscribe to the entry cache like EntryVotes does, so an optimistic vote's
  // payout bump renders immediately. The waves list passes the original feed row
  // as the prop (WaveActions receives `item`, not the cache-aware entry), so
  // without this the payout stayed stale until the feed refetched.
  const { data } = useQuery(EcencyEntriesCacheManagement.getEntryQuery(initialEntry));
  const entry = data ?? initialEntry;

  const check = entry.max_accepted_payout;
  // Real search-API results expose a numeric `payout` and lack the asset-string
  // payout fields. Waves/RPC entries also carry an `id`, so detecting a search
  // result by id alone misrouted waves here and overrode the summed payout with a
  // missing numeric payout (rendering $0.000). Require the numeric payout AND the
  // absence of max_accepted_payout so only true search results take this branch.
  const isSearchResult =
    (entry.id || 0) > 0 && typeof entry.payout === "number" && !entry.max_accepted_payout;

  let isPayoutDeclined,
    pendingPayout,
    authorPayout,
    curatorPayout,
    maxPayout,
    totalPayout,
    payoutLimitHit,
    shownPayout;

  if (check) {
    isPayoutDeclined = parseAsset(entry.max_accepted_payout).amount === 0;

    pendingPayout = parseAsset(entry.pending_payout_value).amount;
    authorPayout = parseAsset(entry.author_payout_value).amount;
    curatorPayout = parseAsset(entry.curator_payout_value).amount;
    maxPayout = parseAsset(entry.max_accepted_payout).amount;
    totalPayout = pendingPayout + authorPayout + curatorPayout;
    payoutLimitHit = totalPayout >= maxPayout;
    shownPayout = payoutLimitHit && maxPayout > 0 ? maxPayout : totalPayout;
  }

  if (isSearchResult) {
    shownPayout = entry.payout;
  }

  // Ref guard for the payout tick: remember the first-seen value (per entry,
  // so list-recycled instances never tick for a different post) and animate
  // only when the payout changes after mount — never on first paint.
  const payoutKey = `${entry.author}/${entry.permlink}`;
  const firstSeenPayout = useRef({ payoutKey, value: shownPayout });
  if (firstSeenPayout.current.payoutKey !== payoutKey) {
    firstSeenPayout.current = { payoutKey, value: shownPayout };
  }
  const payoutChanged = shownPayout !== firstSeenPayout.current.value;
  const payoutFigure = (
    <span key={shownPayout} className={payoutChanged ? "inline-block animate-tick" : undefined}>
      <FormattedCurrency value={shownPayout ?? 0} fixAt={3} />
    </span>
  );

  return !isSearchResult ? (
    <div className="noselection">
      <Popover
        directContent={
          <div
            role="presentation"
            onMouseOver={() => setShowPopover(true)}
            onMouseLeave={() => setShowPopover(false)}
            className={classNameObject({
              "entry-payout notranslate": true,
              "payout-declined": isPayoutDeclined,
              "payout-limit-hit": payoutLimitHit
            })}
          >
            {payoutFigure}
          </div>
        }
        behavior="hover"
        show={showPopover}
        setShow={setShowPopover}
      >
        <PopoverContent>
          <EntryPayoutDetail entry={entry} />
        </PopoverContent>
      </Popover>
    </div>
  ) : (
    <div
      className={classNameObject({
        "entry-payout notranslate": true,
        "payout-declined": isPayoutDeclined,
        "payout-limit-hit": payoutLimitHit
      })}
    >
      {payoutFigure}
    </div>
  );
};
