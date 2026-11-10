export interface ApiResponse<T> {
  status: number;
  data: T;
}

export interface CurrencyRates {
  [currency: string]: {
    quotes: {
      [currency: string]: {
        last_updated: string;
        percent_change: number;
        price: number;
      };
    };
  };
}

export type RecoveryRequestStatus =
  | "started"
  | "proven"
  | "approved"
  | "requested"
  | "completed"
  | "failed"
  | "expired";

export interface RecoveryErrorBody {
  error?: string;
  attempts_left?: number;
}

export interface RecoveryStartResponse {
  request_id?: string;
  nonce?: string;
}

export interface RecoveryProveResponse {
  emails?: string[];
}

export interface RecoveryStatusResponse {
  status?: RecoveryRequestStatus;
  tx_id?: string | null;
}
