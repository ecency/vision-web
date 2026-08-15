import i18next from "i18next";
import { Tsx } from "@/features/i18n/helper";
import { Entry } from "@/entities";
import { isHiddenPost, isLowTrustSeoPost } from "@ecency/sdk";
import { EntryPageMightContainsMutedCommentsWarning } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-might-contains-muted-comments-warning";

interface Props {
  entry: Entry;
}

export function EntryPageWarnings({ entry }: Props) {
  const isMuted = !!entry.stats?.gray && entry.net_rshares >= 0 && entry.author_reputation >= 0;
  const isHidden = isHiddenPost(
    entry?.net_rshares,
    entry?.stats?.total_votes ?? entry?.active_votes?.length ?? 0
  );
  const isLowReputation =
    !!entry.stats?.gray && entry.net_rshares >= 0 && entry.author_reputation < 0;
  // Low-reputation account publishing an outbound promo link (SEO/backlink-farm
  // signature; reputation only, not account age). We warn rather than hide; the
  // outbound link carries no SEO value (noindex) and the reader is cautioned.
  const isLowTrust = isLowTrustSeoPost(entry);

  return (
    <>
      {isMuted && (
        <div className="hidden-warning">
          <span>
            <Tsx
              k="entry.muted-warning"
              args={{ community: entry.community ? entry.community_title : "" }}
            >
              <span />
            </Tsx>
          </span>
        </div>
      )}

      {isHidden && (
        <div className="hidden-warning">
          <span>{i18next.t("entry.hidden-warning")}</span>
        </div>
      )}

      {isLowReputation && (
        <div className="hidden-warning">
          <span>{i18next.t("entry.lowrep-warning")}</span>
        </div>
      )}

      {isLowTrust && (
        <div className="hidden-warning">
          <span>{i18next.t("entry.lowtrust-warning")}</span>
        </div>
      )}
      <EntryPageMightContainsMutedCommentsWarning entry={entry} />
    </>
  );
}
