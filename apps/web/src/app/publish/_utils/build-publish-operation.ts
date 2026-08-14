import { enforceThreeSpeakBeneficiary } from "@/api/threespeak-embed";
import {
  collectPresentMemeAttribution,
  DECENTMEMES_FRONTEND,
  enforceDecentMemesBeneficiary,
  ensureDecentMemesTag
} from "@/api/decentmemes";
import { SUBMIT_DESCRIPTION_MAX_LENGTH } from "@/app/submit/_consts";
import { BeneficiaryRoute, Entry, RewardType } from "@/entities";
import { EntryBodyManagement, EntryMetadataManagement } from "@/features/entry-management";
import { PollSnapshot } from "@/features/polls";
import { makeCommentOptions } from "@/utils";
import { postBodySummary } from "@ecency/render-helper";

export interface PublishDraft {
  author: string;
  permlink: string;
  title: string;
  content: string;
  tags: string[];
  metaDescription?: string | null;
  selectedThumbnail?: string;
  reward?: RewardType | string;
  beneficiaries?: BeneficiaryRoute[];
  poll?: PollSnapshot;
  postLinks?: Entry[];
  location?: any;
  decentMemes?: any;
  aiTools?: any;
}

export interface PublishOperation {
  /** The comment operation exactly as it will be broadcast. */
  op: {
    author: string;
    permlink: string;
    parent_author: string;
    parent_permlink: string;
    title: string;
    body: string;
    json_metadata: string;
  };
  /** The metadata object, before serialization, for the broadcast payload. */
  jsonMetadata: Record<string, any>;
  /**
   * The description fed to the metadata builder, before it truncates further.
   * Returned so the caller's cached entry keeps the length it always had.
   */
  summary: string;
  /** The comment_options operation, when this post needs one. */
  options: ReturnType<typeof makeCommentOptions>;
  /** Beneficiaries after the ThreeSpeak/DecentMemes rules were applied. */
  beneficiaries: BeneficiaryRoute[];
  /** Meme beneficiaries had to be trimmed to fit Hive's limits. */
  beneficiariesDropped: boolean;
}

/**
 * Assembles the operation a publish broadcasts: cleaned body, full metadata,
 * enforced beneficiaries and comment options.
 *
 * Shared with the RC pre-check on purpose. Cost is driven by serialized size,
 * so an estimate built from the raw editor draft, or from tags-only metadata,
 * underprices a post carrying a summary, images, links, a poll or beneficiaries
 * and can call a post affordable that the chain then rejects. The only way that
 * stays true as publishing grows features is for both paths to build the
 * operation here.
 *
 * Side effects belong to the caller: nothing here informs the user or touches
 * the network, so the pre-check can run it while the author is still typing.
 * The permlink is passed in because the real one is only settled at broadcast
 * time, after the collision check.
 */
export async function buildPublishOperation({
  author,
  permlink,
  title,
  content,
  tags,
  metaDescription,
  selectedThumbnail,
  reward,
  beneficiaries,
  poll,
  postLinks,
  location,
  decentMemes,
  aiTools
}: PublishDraft): Promise<PublishOperation> {
  let cleanBody = EntryBodyManagement.EntryBodyManager.shared.builder().buildClearBody(content);

  cleanBody = EntryBodyManagement.EntryBodyManager.shared
    .builder()
    .withLocation(cleanBody, location);

  // DecentMemes: reconcile tracked memes against the final body so a meme
  // whose image was deleted no longer contributes a tag / metadata / beneficiary.
  const memeAttribution = collectPresentMemeAttribution(decentMemes, cleanBody);
  const hasMeme = memeAttribution.templateIds.length > 0;
  const finalTags = hasMeme ? ensureDecentMemesTag(tags ?? []) : tags;

  // It should select filled description or if its empty or null/undefined then get auto summary
  const summary = metaDescription || postBodySummary(cleanBody, SUBMIT_DESCRIPTION_MAX_LENGTH);

  const metaBuilder = await EntryMetadataManagement.EntryMetadataManager.shared
    .builder()
    .default()
    .extractFromBody(content)
    .withSummary(summary)
    .withTags(finalTags)
    .withPostLinks(postLinks)
    .withLocation(location)
    .withSelectedThumbnail(selectedThumbnail);
  const jsonMeta = metaBuilder
    .withPoll(poll)
    .withDecentMemes(
      hasMeme
        ? { templateIds: memeAttribution.templateIds, frontend: DECENTMEMES_FRONTEND }
        : undefined
    )
    .withAiTools(aiTools)
    .build();

  let finalBeneficiaries = enforceThreeSpeakBeneficiary(beneficiaries ?? [], cleanBody);
  let beneficiariesDropped = false;
  if (hasMeme) {
    // Merge the widget-supplied meme beneficiaries on our own terms: never
    // trust its numbers - cap to Hive's 8-slot / 100% limits and keep the
    // user's own beneficiaries intact.
    const enforced = enforceDecentMemesBeneficiary(
      finalBeneficiaries,
      memeAttribution.beneficiaries,
      author
    );
    finalBeneficiaries = enforced.beneficiaries;
    beneficiariesDropped = enforced.dropped;
  }

  const options = makeCommentOptions(
    author,
    permlink,
    reward as RewardType,
    finalBeneficiaries
  );

  return {
    op: {
      author,
      permlink,
      parent_author: "",
      // The broadcast reads the first tag as posted, before the DecentMemes
      // tag is folded in, so this must too.
      parent_permlink: tags?.[0] ?? "",
      title,
      body: cleanBody,
      json_metadata: JSON.stringify(jsonMeta)
    },
    jsonMetadata: jsonMeta,
    summary,
    options,
    beneficiaries: finalBeneficiaries,
    beneficiariesDropped
  };
}
