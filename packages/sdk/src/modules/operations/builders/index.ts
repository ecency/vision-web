/**
 * Operation Builders
 *
 * Centralized, type-safe operation builders for Hive blockchain operations.
 * Extracted from mobile (dhive.ts) and web (operations.ts) implementations.
 *
 * All builders return Operation or Operation[] types from ../../../hive-tx.
 * They validate inputs and throw clear errors for missing/invalid parameters.
 *
 * Usage:
 * ```typescript
 * import { buildVoteOp, buildTransferOp } from '@ecency/sdk';
 *
 * const voteOp = buildVoteOp('voter', 'author', 'permlink', 10000);
 * const transferOp = buildTransferOp('alice', 'bob', '1.000 HIVE', 'Hello!');
 * ```
 */

// Content Operations
export {
  buildVoteOp,
  buildCommentOp,
  buildCommentOptionsOp,
  buildDeleteCommentOp,
  buildReblogOp,
} from "./content";

// Wallet Operations
export {
  buildTransferOp,
  buildMultiTransferOps,
  buildRecurrentTransferOp,
  buildTransferToSavingsOp,
  buildTransferFromSavingsOp,
  buildCancelTransferFromSavingsOp,
  buildClaimInterestOps,
  buildTransferToVestingOp,
  buildWithdrawVestingOp,
  buildDelegateVestingSharesOp,
  buildSetWithdrawVestingRouteOp,
  buildConvertOp,
  buildCollateralizedConvertOp,
  buildDelegateRcOp,
  buildEngineOp,
  buildEngineClaimOp,
} from "./wallet";

// Social Operations
export {
  buildFollowOp,
  buildUnfollowOp,
  buildIgnoreOp,
  buildUnignoreOp,
  buildSetLastReadOps,
} from "./social";

// Governance Operations
export {
  buildWitnessVoteOp,
  buildWitnessProxyOp,
  buildProposalCreateOp,
  buildProposalVoteOp,
  buildRemoveProposalOp,
  buildUpdateProposalOp,
  type ProposalCreatePayload,
} from "./governance";

// Community Operations
export {
  buildSubscribeOp,
  buildUnsubscribeOp,
  buildSetRoleOp,
  buildUpdateCommunityOp,
  buildPinPostOp,
  buildMutePostOp,
  buildMuteUserOp,
  buildFlagPostOp,
  type CommunityProps,
} from "./community";

// Market Operations
export {
  buildLimitOrderCreateOp,
  buildLimitOrderCreateOpWithType,
  buildLimitOrderCancelOp,
  buildClaimRewardBalanceOp,
  BuySellTransactionType,
  OrderIdPrefix,
} from "./market";

// Account Operations
export {
  buildAccountUpdateOp,
  buildAccountUpdate2Op,
  buildAccountCreateOp,
  buildCreateClaimedAccountOp,
  buildClaimAccountOp,
  buildGrantPostingPermissionOp,
  buildRevokePostingPermissionOp,
  buildChangeRecoveryAccountOp,
  buildRequestAccountRecoveryOp,
  buildRecoverAccountOp,
  type Authority,
  type AccountKeys,
} from "./account";

// Ecency-Specific Operations
export {
  buildBoostPlusOp,
  buildRcDelegationOp,
  buildPromoteOp,
  buildCurationRecommendOp,
  buildCurationUnrecommendOp,
  buildPointTransferOp,
  buildMultiPointTransferOps,
  buildCommunityRegistrationOp,
  buildActiveCustomJsonOp,
  buildPostingCustomJsonOp,
} from "./ecency";
