/**
 * `hive-auth-wrapper` ships no type declarations, so the surface this app uses
 * is declared here. Shapes follow the HAS protocol documented at
 * https://docs.hiveauth.com and the wrapper's own JSDoc.
 */
declare module 'hive-auth-wrapper' {
  /**
   * Credentials the wrapper reads from and writes back to. `authenticate()`
   * mutates this object in place on success, filling in `token`, `expire` and
   * the generated `key`.
   */
  export interface HasAuth {
    username: string;
    /** Session token issued by the PKSA. */
    token?: string;
    /** Token expiry as an epoch in MILLISECONDS. */
    expire?: number;
    /** AES key shared with the PKSA out of band, through the QR payload. */
    key?: string;
  }

  export interface HasAppMeta {
    name: string;
    description?: string;
    icon?: string;
  }

  export interface HasChallengeData {
    /** posting, active, owner or memo. */
    key_type: string;
    /** Plain string for the PKSA to sign. The wrapper encrypts it. */
    challenge: string;
  }

  /** `auth_wait` / `sign_wait`: the request is queued for the PKSA to approve. */
  export interface HasWaitEvent {
    cmd: string;
    uuid: string;
    expire: number;
    account?: string;
    /** Only on `auth_wait`, injected by the wrapper so the app can build the QR. */
    key?: string;
  }

  export interface HasResponse {
    cmd: string;
    uuid?: string;
    data?: unknown;
    error?: string;
    broadcast?: boolean;
  }

  /** A `challenge_ack`, whose `data` the wrapper has already decrypted. */
  export interface HasChallengeResponse extends HasResponse {
    data?: {
      /** The signature over sha256 of the string that was sent, as hex. */
      challenge?: string;
      /** The public key that produced it. */
      pubkey?: string;
    };
  }

  export interface HasOptions {
    host?: string;
    auth_key_secret?: string;
  }

  const HAS: {
    setOptions(options: HasOptions): void;
    status(): { host: string; connected: boolean; timeout: number };
    connect(): Promise<boolean>;
    traceOn(): void;
    traceOff(): void;
    authenticate(
      auth: HasAuth,
      appData: HasAppMeta,
      challengeData?: HasChallengeData,
      cbWait?: (evt: HasWaitEvent) => void,
    ): Promise<HasResponse>;
    broadcast(
      auth: HasAuth,
      keyType: string,
      ops: unknown[],
      cbWait?: (evt: HasWaitEvent) => void,
    ): Promise<HasResponse>;
    /**
     * Sign an arbitrary string with one of the account's keys.
     *
     * Separate from `broadcast`, and the reason "HiveAuth cannot sign" is
     * wrong: the wrapper has no offline transaction signing, but it has this.
     *
     * The acknowledgement is decrypted by the wrapper before it resolves, and
     * `data.challenge` is the SIGNATURE, not the string that was sent. Verified
     * against the wrapper source (`has-wrapper.js`, the `CHALLENGE_ACK` branch)
     * and its README, which checks `Signature.fromHex(res.data.challenge)`
     * against `res.data.pubkey`, rather than against this file.
     */
    challenge(
      auth: HasAuth,
      challengeData: HasChallengeData,
      cbWait?: (evt: HasWaitEvent) => void,
    ): Promise<HasChallengeResponse>;
  };

  export default HAS;
}
