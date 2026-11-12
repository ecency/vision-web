export interface EcencyTokenMetadata {
  address?: string;
  privateKey?: string;
  publicKey?: string;
  username?: string;
  currency?: string;
  custom?: boolean;
  type: string; // "CHAIN" | "HIVE"
  /**
   * Represents showing of the token in the Ecency wallet
   */
  show?: boolean;
}
