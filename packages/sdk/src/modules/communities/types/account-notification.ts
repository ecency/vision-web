export interface AccountNotification {
  date: string;
  // A string: the bridge returns ids above 2^53, which a number would round.
  id: string;
  msg: string;
  score: number;
  type: string;
  url: string;
}
