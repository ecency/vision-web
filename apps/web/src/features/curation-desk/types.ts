import type {
  CurationApp,
  CurationFlagReason,
  CurationMarkState,
  CurationRole,
  CurationRosterRow,
  CurationSort,
  CurationWindow,
} from "@ecency/sdk";

/** Row as the desk renders it: public rows have a null overlay. */
export type DeskRow = CurationRosterRow;

export type ViewerKind = "anon" | "member" | "roster";

export interface ViewerRole {
  username: string | undefined;
  kind: ViewerKind;
  role: CurationRole | null;
  isRoster: boolean;
  isTrial: boolean;
  canRewindCursor: boolean;
  isLoading: boolean;
}

export interface QueueFilters {
  sort: CurationSort;
  seed: string;
  unreviewedOnly: boolean;
  hideCurated: boolean;
  app: CurationApp;
  community: string;
  newAuthors: boolean;
  recommended: boolean;
  flagged: boolean;
  window: CurationWindow;
  minWords: number | null;
  maxWords: number | null;
  hasImages: boolean;
  repMin: number;
  repMax: number;
}

export type WindowState =
  | { kind: "full"; msLeft: number; urgent: boolean }
  | { kind: "half"; ageMs: number }
  | { kind: "eighth"; ageMs: number }
  | { kind: "locked"; scalePct: number; voteHidden: boolean }
  | { kind: "paid" };

export type RowSection = "pinned" | "queue" | "tail-half" | "tail-eighth" | "below-cursor";

export type QueueDisplayItem =
  | {
      type: "row";
      key: string;
      row: DeskRow;
      section: RowSection;
      late: boolean;
      resurfaced: boolean;
      belowCursor: boolean;
      reviewedByCursor: boolean;
    }
  | { type: "divider"; key: string }
  | { type: "tail"; key: string; window: "half" | "eighth"; count: number; expanded: boolean }
  | { type: "older-reviewed"; key: string; count: number; expanded: boolean };

export interface MarkActionInput {
  row: DeskRow;
  state: CurationMarkState;
  reason?: CurationFlagReason | string;
  note?: string;
  snooze_until?: string;
}

/** Recommender-side state of one post for the viewer. Chain truth, optimistic locally. */
export type RecommendState =
  | { phase: "idle" }
  | { phase: "pending"; since: number; withdraw: boolean; trxId: string | null; pinged: boolean }
  | { phase: "recommended"; confirmed: boolean }
  | { phase: "confirming"; withdraw: boolean }
  | { phase: "withdrawn" };
