import type {
  CurationApp,
  CurationFlagReason,
  CurationMarkState,
  CurationOverlay,
  CurationRole,
  CurationRow,
  CurationSort,
  CurationWindow,
} from "@ecency/sdk";

/**
 * Row as the desk renders it. The roster feed adds an overlay; a public row
 * carries none; the desk reads it with `?.` rather than normalising every
 * loaded row into a new object (that would defeat React.memo on every tick).
 */
export type DeskRow = CurationRow & { overlay?: CurationOverlay | null };

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
  /** null = the role's default (queue for the roster, newest for everyone else). */
  sort: CurationSort | null;
  seed: string;
  /** null = the role's default (on for the roster). */
  unreviewedOnly: boolean | null;
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
  /** Roster only: `view=excluded`, the rows the public queue never serves. */
  excluded: boolean;
}

export type ResolvedQueueFilters = Omit<QueueFilters, "sort" | "unreviewedOnly"> & {
  sort: CurationSort;
  unreviewedOnly: boolean;
};

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
      /**
       * Window state at the `now` the display was built with. The row takes it
       * as props so only the badge subscribes to the shared clock.
       */
      windowKind: WindowState["kind"];
      locked: boolean;
      voteHidden: boolean;
      scalePct: number;
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
