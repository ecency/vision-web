import type { Operation } from '@ecency/sdk';
import HAS, { type HasAuth, type HasChallengeData } from 'hive-auth-wrapper';
import { HIVEAUTH_API, HIVEAUTH_APP } from '../constants';
import type { HiveAuthSession } from '../types';

/**
 * HiveAuth (HAS) client.
 *
 * The protocol is not a plain JSON exchange: everything an app sends in a
 * request `data` field is AES encrypted with a per-session auth key, and the
 * PKSA replies encrypted with the same key. The key never travels over the
 * socket; it reaches the wallet out of band, in the QR payload the user scans.
 * A hand-rolled client that sends `auth_req.data` in the clear, reads
 * `auth_ack.data` as plain JSON, or emits a QR under a scheme no wallet
 * registers cannot complete a login, so the crypto and the socket lifecycle are
 * delegated to the official wrapper instead of being reimplemented here.
 */

type HiveAuthCallback = {
  onQRCode?: (qrData: string) => void;
  onWaiting?: () => void;
  onSuccess?: (session: HiveAuthSession) => void;
  onError?: (error: string) => void;
};

type HiveAuthSignCallback = {
  onWaiting?: () => void;
  onSuccess?: (data?: string) => void;
  onError?: (error: string) => void;
};

/** Authorities HiveAuth can be asked to sign with. */
export type HiveAuthKeyType = 'posting' | 'active' | 'owner' | 'memo';

/** Shown by the wallet when it asks the user to approve the request. */
const APP_META = {
  name: HIVEAUTH_APP,
  description: 'Ecency self-hosted blog',
};

/**
 * The payload a HiveAuth wallet expects to scan. `has://auth_req/` is the
 * scheme wallets register; anything else produces a QR that scans as unknown
 * text. `key` is the AES key for the rest of the exchange, which is why it
 * travels here and not over the websocket.
 */
export function buildHiveAuthQrPayload(params: {
  account: string;
  uuid: string;
  key: string;
  host: string;
}): string {
  const payload = {
    account: params.account,
    uuid: params.uuid,
    key: params.key,
    host: params.host,
  };

  return `has://auth_req/${btoa(JSON.stringify(payload))}`;
}

/**
 * Challenge the wallet signs to prove it holds the account's posting key.
 * Sent as plain data; the wrapper encrypts it with the auth key.
 */
export function buildLoginChallenge(username: string): HasChallengeData {
  return {
    key_type: 'posting',
    challenge: JSON.stringify({ login: username, ts: Date.now() }),
  };
}

/**
 * HAS reports token expiry as an epoch in milliseconds. The stored session
 * keeps seconds, which is what `storage.ts`, `isHiveAuthSessionValid` and
 * auth-actions' `session.expire * 1000` all assume. Storing the raw HAS value
 * would push every expiry check thousands of years out.
 */
export function toHiveAuthSession(
  username: string,
  auth: HasAuth,
): HiveAuthSession {
  if (!auth.key) {
    throw new Error('HiveAuth returned no encryption key');
  }
  // No token check. HAS deprecated it and protocol v1 acknowledgements omit it,
  // so requiring one rejects an authentication the wallet already approved. The
  // key and the expiry are what establish the session; the token is carried
  // through only when a pre-v1 wallet sends one.
  if (!auth.expire) {
    throw new Error('HiveAuth returned no session expiry');
  }

  return {
    username,
    ...(auth.token ? { token: auth.token } : {}),
    expire: Math.floor(auth.expire / 1000),
    key: auth.key,
  };
}

/** Rebuild the wrapper's credentials from a stored session, expiry back in ms. */
export function toHiveAuthCredentials(session: HiveAuthSession): HasAuth {
  return {
    username: session.username,
    ...(session.token ? { token: session.token } : {}),
    expire: session.expire * 1000,
    key: session.key,
  };
}

/**
 * HAS rejects with either an Error or a raw protocol message, so a plain
 * `error.message` read turns half the failures into "undefined".
 */
export function describeHiveAuthError(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message === 'expired'
      ? 'HiveAuth request expired'
      : reason.message;
  }

  if (reason && typeof reason === 'object') {
    const message = reason as { cmd?: string; error?: string };
    if (typeof message.error === 'string' && message.error) {
      return message.error;
    }
    switch (message.cmd) {
      case 'auth_nack':
        return 'Authentication rejected';
      case 'auth_err':
        return 'Authentication error';
      case 'sign_nack':
        return 'Transaction rejected';
      case 'sign_err':
        return 'Signing error';
    }
  }

  return 'HiveAuth request failed';
}

/**
 * HiveAuth login flow. Resolves once the wallet has approved; `onSuccess`
 * carries the session the caller has to persist.
 */
export async function loginWithHiveAuth(
  username: string,
  callbacks: HiveAuthCallback,
): Promise<void> {
  HAS.setOptions({ host: HIVEAUTH_API });

  // The wrapper fills token, expire and key into this object on success.
  const auth: HasAuth = { username };

  try {
    await HAS.authenticate(
      auth,
      APP_META,
      buildLoginChallenge(username),
      (evt) => {
        // evt.key is the auth key the wrapper generated for this request. The
        // wallet cannot decrypt anything until it reads the key from the QR.
        callbacks.onQRCode?.(
          buildHiveAuthQrPayload({
            account: username,
            uuid: evt.uuid,
            key: evt.key ?? auth.key ?? '',
            host: HIVEAUTH_API,
          }),
        );
        callbacks.onWaiting?.();
      },
    );
  } catch (error) {
    const message = describeHiveAuthError(error);
    callbacks.onError?.(message);
    throw new Error(message);
  }

  let session: HiveAuthSession;
  try {
    session = toHiveAuthSession(username, auth);
  } catch (error) {
    const message = describeHiveAuthError(error);
    callbacks.onError?.(message);
    throw new Error(message);
  }

  callbacks.onSuccess?.(session);
}

/**
 * Broadcast operations with HiveAuth.
 *
 * The authority is the caller's to choose. Hardcoding 'posting' meant an
 * active operation - a transfer, a tip, a custom_json with required_auths -
 * asked the wallet for the posting key, and the chain rejects a transfer
 * signed with posting authority.
 */
export async function broadcastWithHiveAuth(
  session: HiveAuthSession,
  operations: Operation[],
  keyType: HiveAuthKeyType = 'posting',
  callbacks?: HiveAuthSignCallback,
): Promise<void> {
  HAS.setOptions({ host: HIVEAUTH_API });

  try {
    const response = await HAS.broadcast(
      toHiveAuthCredentials(session),
      keyType,
      operations,
      () => callbacks?.onWaiting?.(),
    );
    callbacks?.onSuccess?.(
      typeof response?.data === 'string' ? response.data : undefined,
    );
  } catch (error) {
    const message = describeHiveAuthError(error);
    callbacks?.onError?.(message);
    throw new Error(message);
  }
}

/**
 * Check if HiveAuth session is valid
 */
export function isHiveAuthSessionValid(
  session: HiveAuthSession | null,
): boolean {
  if (!session) return false;
  return Date.now() < session.expire * 1000;
}
