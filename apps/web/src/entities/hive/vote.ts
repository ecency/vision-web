/** A voter-list row. `reputation` is absent on rows read through database_api. */
export interface Vote {
  percent: number;
  reputation?: number;
  rshares: string | number;
  time: string;
  timestamp?: number;
  voter: string;
  weight: number;
  reward?: number;
}
