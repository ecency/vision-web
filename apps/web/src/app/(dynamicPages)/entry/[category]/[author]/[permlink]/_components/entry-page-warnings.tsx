import i18next from "i18next";
import { Tsx } from "@/features/i18n/helper";
import { Entry } from "@/entities";
import { ContentModerationReason, getContentModerationReason } from "@ecency/sdk";
import { EntryPageMightContainsMutedCommentsWarning } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-might-contains-muted-comments-warning";

interface Props {
  entry: Entry;
}

export function EntryPageWarnings({ entry }: Props) {
  // One reason wins, on the SDK's precedence (moderator action, then downvotes,
  // then low trust), so a post matching several rules cannot stack warnings and
  // claim contradictory things about itself.
  const reason = getContentModerationReason(entry);

  // hivemind grays a post either because a moderator muted it or because the
  // author's own reputation went negative. Both arrive as the same flag, so the
  // reputation sign is what picks the wording.
  const isModerated = reason === ContentModerationReason.MOD_MUTED;
  const isMuted = isModerated && entry.author_reputation >= 0;
  const isLowReputation = isModerated && entry.author_reputation < 0;
  const isHidden = reason === ContentModerationReason.DOWNVOTED;
  // Low-reputation account publishing an outbound promo link (SEO/backlink-farm
  // signature; reputation only, not account age). We warn rather than hide; the
  // outbound link carries no SEO value (noindex) and the reader is cautioned.
  const isLowTrust = reason === ContentModerationReason.LOW_TRUST;

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
