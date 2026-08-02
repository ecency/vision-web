import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * HiveAuth (HAS) is an encrypted protocol, not a plain JSON exchange: the app
 * AES-encrypts every request `data` field with a per-session auth key and the
 * wallet replies encrypted with the same key, which it learns only by scanning
 * the QR. These tests cover the parts that can be exercised without a live HAS
 * server: the QR payload the wallet has to scan, the data handed to the
 * protocol library, and the session shape the rest of the app persists.
 */

const has = vi.hoisted(() => ({
  setOptions: vi.fn(),
  authenticate: vi.fn(),
  broadcast: vi.fn(),
}));

vi.mock('hive-auth-wrapper', () => ({ default: has }));

const {
  broadcastWithHiveAuth,
  buildHiveAuthQrPayload,
  buildLoginChallenge,
  describeHiveAuthError,
  isHiveAuthSessionValid,
  loginWithHiveAuth,
  toHiveAuthCredentials,
  toHiveAuthSession,
} = await import('./hive-auth');

const { HIVEAUTH_API, HIVEAUTH_APP } = await import('../constants');

const QR_PREFIX = 'has://auth_req/';

function decodeQr(qr: string) {
  expect(qr.startsWith(QR_PREFIX)).toBe(true);
  return JSON.parse(atob(qr.slice(QR_PREFIX.length)));
}

/** A successful authenticate(): fills the credentials the wrapper mutates. */
function approveAuth(expireMs: number) {
  return async (
    auth: { token?: string; expire?: number; key?: string },
    _app: unknown,
    _challenge: unknown,
    cbWait?: (evt: {
      cmd: string;
      uuid: string;
      expire: number;
      key?: string;
    }) => void,
  ) => {
    cbWait?.({
      cmd: 'auth_wait',
      uuid: 'req-uuid',
      expire: expireMs,
      key: 'auth-key',
    });
    auth.token = 'session-token';
    auth.expire = expireMs;
    auth.key = 'auth-key';
    return { cmd: 'auth_ack' };
  };
}

beforeEach(() => {
  has.setOptions.mockClear();
  has.authenticate.mockReset();
  has.broadcast.mockReset();
});

/**
 * `hiveauth://auth/` is registered by no wallet, so the previous QR scanned as
 * unknown text and the login could never be approved.
 */
describe('QR payload', () => {
  it('uses the has:// auth_req scheme wallets register', () => {
    const qr = buildHiveAuthQrPayload({
      account: 'alice',
      uuid: 'req-uuid',
      key: 'auth-key',
      host: 'wss://has.example',
    });

    expect(qr.startsWith(QR_PREFIX)).toBe(true);
  });

  it('carries the account, request uuid, auth key and host as base64 json', () => {
    const qr = buildHiveAuthQrPayload({
      account: 'alice',
      uuid: 'req-uuid',
      key: 'auth-key',
      host: 'wss://has.example',
    });

    expect(decodeQr(qr)).toEqual({
      account: 'alice',
      uuid: 'req-uuid',
      key: 'auth-key',
      host: 'wss://has.example',
    });
  });
});

describe('login', () => {
  it('emits a scannable QR built from the auth_wait uuid and the auth key', async () => {
    has.authenticate.mockImplementation(approveAuth(Date.now() + 3_600_000));
    const onQRCode = vi.fn();
    const onWaiting = vi.fn();

    await loginWithHiveAuth('alice', { onQRCode, onWaiting });

    expect(onQRCode).toHaveBeenCalledTimes(1);
    expect(decodeQr(onQRCode.mock.calls[0][0])).toEqual({
      account: 'alice',
      uuid: 'req-uuid',
      // Without the key in the QR the wallet cannot decrypt the request.
      key: 'auth-key',
      host: HIVEAUTH_API,
    });
    expect(onWaiting).toHaveBeenCalled();
  });

  it('hands the app data and challenge to the protocol library unencrypted', async () => {
    has.authenticate.mockImplementation(approveAuth(Date.now() + 3_600_000));

    await loginWithHiveAuth('alice', {});

    const [, appData, challenge] = has.authenticate.mock.calls[0];
    expect(appData.name).toBe(HIVEAUTH_APP);
    // The library encrypts these into auth_req.data. Sending them ready-made
    // as the request body, as the hand-rolled client did, is what the PKSA
    // cannot read.
    expect(challenge.key_type).toBe('posting');
    expect(JSON.parse(challenge.challenge)).toMatchObject({ login: 'alice' });
  });

  it('connects to the configured HAS host', async () => {
    has.authenticate.mockImplementation(approveAuth(Date.now() + 3_600_000));

    await loginWithHiveAuth('alice', {});

    expect(has.setOptions).toHaveBeenCalledWith({ host: HIVEAUTH_API });
  });

  it('reports a rejected authentication instead of an undefined message', async () => {
    has.authenticate.mockRejectedValue({ cmd: 'auth_nack', uuid: 'req-uuid' });
    const onError = vi.fn();

    await expect(loginWithHiveAuth('alice', { onError })).rejects.toThrow(
      'Authentication rejected',
    );
    expect(onError).toHaveBeenCalledWith('Authentication rejected');
  });
});

describe('login challenge', () => {
  it('asks for a posting-key signature over a timestamped login string', () => {
    const challenge = buildLoginChallenge('alice');

    expect(challenge.key_type).toBe('posting');
    const body = JSON.parse(challenge.challenge);
    expect(body.login).toBe('alice');
    expect(typeof body.ts).toBe('number');
  });
});

/**
 * HAS reports expiry in milliseconds while storage.ts, isHiveAuthSessionValid
 * and auth-actions all multiply the stored value by 1000. Storing the raw HAS
 * value pushes every expiry check thousands of years out, so a revoked session
 * would look live forever.
 */
describe('session shape', () => {
  it('stores the HAS expiry in seconds', () => {
    const session = toHiveAuthSession('alice', {
      username: 'alice',
      token: 'session-token',
      expire: 1_893_456_000_000,
      key: 'auth-key',
    });

    expect(session).toEqual({
      username: 'alice',
      token: 'session-token',
      expire: 1_893_456_000,
      key: 'auth-key',
    });
  });

  it('is still valid an hour before it expires', () => {
    const session = toHiveAuthSession('alice', {
      username: 'alice',
      token: 'session-token',
      expire: Date.now() + 3_600_000,
      key: 'auth-key',
    });

    expect(isHiveAuthSessionValid(session)).toBe(true);
  });

  it('is expired once the HAS expiry has passed', () => {
    const session = toHiveAuthSession('alice', {
      username: 'alice',
      token: 'session-token',
      expire: Date.now() - 60_000,
      key: 'auth-key',
    });

    expect(isHiveAuthSessionValid(session)).toBe(false);
  });

  it('round-trips back to the credentials the protocol library expects', () => {
    const expire = 1_893_456_000_000;
    const session = toHiveAuthSession('alice', {
      username: 'alice',
      token: 'session-token',
      expire,
      key: 'auth-key',
    });

    expect(toHiveAuthCredentials(JSON.parse(JSON.stringify(session)))).toEqual({
      username: 'alice',
      token: 'session-token',
      expire,
      key: 'auth-key',
    });
  });

  it('refuses a session without the auth key needed to sign later', () => {
    expect(() =>
      toHiveAuthSession('alice', { username: 'alice', token: 't', expire: 1 }),
    ).toThrow(/encryption key/);
  });

  it('reaches login callers as a complete session', async () => {
    const expire = Date.now() + 3_600_000;
    has.authenticate.mockImplementation(approveAuth(expire));
    const onSuccess = vi.fn();

    await loginWithHiveAuth('alice', { onSuccess });

    expect(onSuccess).toHaveBeenCalledWith({
      username: 'alice',
      token: 'session-token',
      expire: Math.floor(expire / 1000),
      key: 'auth-key',
    });
  });
});

/**
 * The chain rejects a transfer signed with posting authority, so dropping the
 * requested key type made every active operation through HiveAuth fail.
 */
describe('broadcast', () => {
  const session = {
    username: 'alice',
    token: 'session-token',
    expire: 1_893_456_000,
    key: 'auth-key',
  };
  const op = ['vote', { voter: 'alice' }] as never;

  it('signs with the requested authority', async () => {
    has.broadcast.mockResolvedValue({ cmd: 'sign_ack', data: 'tx-id' });

    await broadcastWithHiveAuth(session, [op], 'active');

    expect(has.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'alice', key: 'auth-key' }),
      'active',
      [op],
      expect.any(Function),
    );
  });

  it('defaults to posting when the caller does not ask for an authority', async () => {
    has.broadcast.mockResolvedValue({ cmd: 'sign_ack' });

    await broadcastWithHiveAuth(session, [op]);

    expect(has.broadcast.mock.calls[0][1]).toBe('posting');
  });

  it('signs with the stored auth key, so the wallet can decrypt the ops', async () => {
    has.broadcast.mockResolvedValue({ cmd: 'sign_ack' });

    await broadcastWithHiveAuth(session, [op], 'posting');

    expect(has.broadcast.mock.calls[0][0].key).toBe('auth-key');
  });

  it('reports a rejected transaction instead of an undefined message', async () => {
    has.broadcast.mockRejectedValue({ cmd: 'sign_nack', uuid: 'req-uuid' });
    const onError = vi.fn();

    await expect(
      broadcastWithHiveAuth(session, [op], 'active', { onError }),
    ).rejects.toThrow('Transaction rejected');
    expect(onError).toHaveBeenCalledWith('Transaction rejected');
  });
});

describe('error descriptions', () => {
  it('names the protocol rejections', () => {
    expect(describeHiveAuthError({ cmd: 'auth_nack' })).toBe(
      'Authentication rejected',
    );
    expect(describeHiveAuthError({ cmd: 'sign_nack' })).toBe(
      'Transaction rejected',
    );
  });

  it('prefers the server-supplied error text', () => {
    expect(
      describeHiveAuthError({ cmd: 'auth_err', error: 'unknown account' }),
    ).toBe('unknown account');
  });

  it('spells out the wrapper timeout', () => {
    expect(describeHiveAuthError(new Error('expired'))).toBe(
      'HiveAuth request expired',
    );
  });

  it('falls back rather than returning undefined', () => {
    expect(describeHiveAuthError(undefined)).toBe('HiveAuth request failed');
  });
});

describe('HAS host', () => {
  it('points at a host that resolves', () => {
    // hiveauth.arcange.eu is NXDOMAIN, so the socket never opened.
    expect(HIVEAUTH_API).toBe('wss://hive-auth.arcange.eu');
  });
});
