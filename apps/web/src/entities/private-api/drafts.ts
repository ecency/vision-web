import { BeneficiaryRoute, DecentMemesEntry, MetaData, RewardType } from "../operations";
import type { PollSnapshot } from "@/features/polls";

export interface DraftMetadata extends MetaData {
  // Optional because the drafts API genuinely omits them, which is how
  // @ecency/sdk declares them too. Declaring them required here made this type
  // incompatible with the SDK's identical Draft and forced a cast at every
  // boundary; every consumer already reads them as `?? []` / `?? "default"`.
  beneficiaries?: BeneficiaryRoute[];
  rewardType?: RewardType;
  poll?: PollSnapshot;
  decentMemes?: DecentMemesEntry[];
  postTemplate?: boolean;
  templateName?: string;
}

export interface Draft {
  body: string;
  created: string;
  modified: string;
  post_type: string;
  tags_arr: string[];
  tags: string;
  timestamp: number;
  title: string;
  _id: string;
  meta?: DraftMetadata;
}
