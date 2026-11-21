// What games-api's /v1/advent routes answer with.

export type DoorKind = "open" | "quiz" | "poll";
export type RewardKind = "points" | "hive" | "hp" | "delegation" | "spotlight";
export type DoorStatus = "locked" | "open" | "closed" | "drawn";

/// What anyone may see of a door: its content only once it has unlocked.
export interface PublicDoor {
  day: number;
  unlockAt: string;
  closeAt: string;
  kind: DoorKind;
  reward: { kind: RewardKind; amounts: number[] };
  status: DoorStatus;
  prompt?: string;
  choices?: string[];
  artwork?: string | null;
}

export type PayoutStatus = "pending" | "paid" | "failed" | "unconfirmed" | "cancelled";

/// The signed-in reader's part in one door.
export interface MeDoor {
  opened: boolean;
  answered: boolean;
  late: boolean;
  prize?: { place: number; kind: RewardKind; amount: number; status: PayoutStatus };
  participation?: { amount: number; status: "paid" | "pending" };
}

export interface SeasonState {
  season: number;
  doors: PublicDoor[];
  /// Participation Points not paid out yet.
  pool?: { left: number };
  me?: {
    account: string;
    doors: Record<string, MeDoor>;
    answered: number;
    reminders: boolean;
    /// A place in the grand draw.
    grand?: { place: number; amount: number; status: PayoutStatus };
  };
}

export interface OpenedDoor extends PublicDoor {
  entry: { answered: boolean; answer: string | null; choice: number | null; late: boolean; wave: string | null };
}

export interface DoorResult {
  day: number;
  seedBlock: number | null;
  seedId: string | null;
  rule: string;
  /// The accounts that qualified, in no order: anyone can redo the draw from these.
  eligible: string[] | null;
  skipped: { account: string; cause: string }[];
  winners: { place: number; account: string; cancelled?: boolean }[];
  entries: number;
  answerIndex?: number;
  tallies?: number[];
}

/// The season's grand draw among readers who answered most doors, in Points.
export interface GrandDraw {
  season: number;
  status: "scheduled" | "drawn";
  drawAt: string;
  minDoors: number;
  amounts: number[];
  seedBlock?: number | null;
  seedId?: string | null;
  rule?: string;
  eligible?: string[];
  skipped?: { account: string; cause: string }[];
  winners?: { place: number; account: string; cancelled?: boolean }[];
}
