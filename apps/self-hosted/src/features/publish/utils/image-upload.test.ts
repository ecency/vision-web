import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/features/auth/types';
import {
  CODE_LIFETIME_MS,
  getImageUploadToken,
  prepareImageFile,
  uploadEditorImage,
  type ImageUploadDeps,
} from './image-upload';

/**
 * #1462: the editor uploads images to the same image service as ecency.com.
 * The service takes a HiveSigner access token or a HiveSigner-style code (a
 * JSON message signed with the posting key). HiveSigner sessions hold a token;
 * Keychain and HiveAuth sessions sign a code once and reuse it while it is
 * valid, as the hosting token does.
 */

const decode = (code: string) =>
  JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(code.replace(/-/g, '+').replace(/_/g, '/').replace(/\./g, '=')),
        (c) => c.charCodeAt(0),
      ),
    ),
  );

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

function deps(over: Partial<ImageUploadDeps> = {}): ImageUploadDeps {
  return {
    signWithExtension: vi.fn(async () => ({ result: 'SIG', extension: 'keychain' as const })),
    signWithHiveAuth: vi.fn(async () => 'HASIG'),
    getHiveAuthSession: () => ({ expire: Date.now() / 1000 + 3600 }) as never,
    now: () => 1_000_000_000_000,
    storage: memoryStorage(),
    isCurrentUser: () => true,
    ...over,
  };
}

const user = (loginType: AuthUser['loginType'], extra: Partial<AuthUser> = {}): AuthUser => ({
  username: 'alice',
  loginType,
  ...extra,
});

describe('getImageUploadToken', () => {
  it('uses a HiveSigner session token as it is', async () => {
    const d = deps();
    expect(await getImageUploadToken(user('hivesigner', { accessToken: 'hs-token' }), d)).toBe('hs-token');
    expect(d.signWithExtension).not.toHaveBeenCalled();
  });

  it('asks a HiveSigner user without a token to log in again', async () => {
    await expect(getImageUploadToken(user('hivesigner'), deps())).rejects.toThrow(/log in again/i);
  });

  it('signs a HiveSigner-style code with the extension for a Keychain session', async () => {
    const d = deps();
    const code = await getImageUploadToken(user('keychain', { extension: 'keychain' }), d);
    const [account, message, authority, extension] = (d.signWithExtension as ReturnType<typeof vi.fn>).mock.calls[0];
    expect([account, authority, extension]).toEqual(['alice', 'Posting', 'keychain']);
    expect(JSON.parse(message)).toEqual({
      signed_message: { type: 'code', app: 'ecency.app' },
      authors: ['alice'],
      timestamp: 1_000_000_000,
    });
    expect(decode(code)).toEqual({ ...JSON.parse(message), signatures: ['SIG'] });
  });

  it('signs the same code through HiveAuth', async () => {
    const d = deps();
    const code = await getImageUploadToken(user('hiveauth'), d);
    expect(d.signWithHiveAuth).toHaveBeenCalledTimes(1);
    expect(decode(code).signatures).toEqual(['HASIG']);
    expect(decode(code).authors).toEqual(['alice']);
  });

  it('reuses a signed code while it is valid, so the wallet asks once', async () => {
    const d = deps();
    const first = await getImageUploadToken(user('keychain'), d);
    const second = await getImageUploadToken(user('keychain'), d);
    expect(second).toBe(first);
    expect(d.signWithExtension).toHaveBeenCalledTimes(1);
  });

  it('signs again once the cached code is near its end, or for another account', async () => {
    let now = 1_000_000_000_000;
    const d = deps({ now: () => now });
    await getImageUploadToken(user('keychain'), d);
    now += CODE_LIFETIME_MS;
    await getImageUploadToken(user('keychain'), d);
    await getImageUploadToken({ ...user('keychain'), username: 'bob' }, d);
    expect(d.signWithExtension).toHaveBeenCalledTimes(3);
  });

  it('reports a cancelled signature instead of uploading with nothing', async () => {
    const d = deps({ signWithExtension: vi.fn(async () => ({ result: '', extension: 'keychain' as const })) });
    await expect(getImageUploadToken(user('keychain'), d)).rejects.toThrow(/cancelled/i);
  });

  it('asks a HiveAuth user with an expired session to log in again', async () => {
    const d = deps({ getHiveAuthSession: () => ({ expire: 1 }) as never });
    await expect(getImageUploadToken(user('hiveauth'), d)).rejects.toThrow(/log in again/i);
  });
});

describe('prepareImageFile', () => {
  it('refuses SVG, which the image service does not accept', async () => {
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    await expect(prepareImageFile(svg, async (f) => f)).rejects.toThrow(/not an image/i);
  });

  it('refuses a file that is not an image', async () => {
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    await expect(prepareImageFile(file, async (f) => f)).rejects.toThrow(/not an image/i);
  });

  it('converts HEIC to JPEG before upload', async () => {
    const heic = new File(['x'], 'IMG_1.HEIC', { type: '' });
    const jpeg = new File(['y'], 'IMG_1.jpg', { type: 'image/jpeg' });
    const convert = vi.fn(async () => jpeg);
    expect(await prepareImageFile(heic, convert)).toBe(jpeg);
    expect(convert).toHaveBeenCalledWith(heic);
  });

  it('gives a file the browser left untyped its image type, which the service requires', async () => {
    const avif = new File(['x'], 'photo.AVIF', { type: '' });
    const prepared = await prepareImageFile(avif, async (f) => f);
    expect(prepared.type).toBe('image/avif');
    expect(prepared.name).toBe('photo.AVIF');
    // A HEIC that could not be converted goes up typed as HEIC.
    const heic = new File(['x'], 'IMG.heic', { type: '' });
    expect((await prepareImageFile(heic, async (f) => f)).type).toBe('image/heic');
  });

  it('leaves other images alone', async () => {
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    const convert = vi.fn();
    expect(await prepareImageFile(png, convert)).toBe(png);
    expect(convert).not.toHaveBeenCalled();
  });
});

describe('uploadEditorImage', () => {
  it('uploads the prepared file with the token and returns its URL', async () => {
    const upload = vi.fn(async () => ({ url: 'https://images.ecency.com/DQm/a.png' }));
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    const url = await uploadEditorImage(png, {
      user: user('hivesigner', { accessToken: 'hs-token' }),
      deps: deps(),
      upload,
      convert: async (f) => f,
    });
    expect(url).toBe('https://images.ecency.com/DQm/a.png');
    expect(upload).toHaveBeenCalledWith(png, 'hs-token', expect.any(AbortSignal));
    // The time limit covers the request only, so it starts after the wallet.
    const signal = (upload.mock.calls[0] as unknown[])[2] as AbortSignal;
    expect(signal.aborted).toBe(false);
  });

  it('forgets a signed code the image service says is invalid, so the next try signs afresh', async () => {
    const d = deps();
    const refused = Object.assign(new Error('Request failed with status 400'), {
      status: 400,
      data: { error: { name: 'invalid_signature' } },
    });
    const upload = vi.fn(async () => {
      throw refused;
    });
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    const options = { user: user('keychain'), deps: d, upload, convert: async (f: File) => f };
    await expect(uploadEditorImage(png, options)).rejects.toThrow();
    await expect(uploadEditorImage(png, options)).rejects.toThrow();
    expect(d.signWithExtension).toHaveBeenCalledTimes(2);
  });

  it('keeps a valid code when the account is refused for another reason', async () => {
    // 403 is the service's low-reputation answer: signing again changes nothing.
    const d = deps();
    const refused = Object.assign(new Error('Request failed with status 403'), {
      status: 403,
      data: { error: { name: 'deplorable' } },
    });
    const upload = vi.fn(async () => {
      throw refused;
    });
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    const options = { user: user('keychain'), deps: d, upload, convert: async (f: File) => f };
    await expect(uploadEditorImage(png, options)).rejects.toThrow();
    await expect(uploadEditorImage(png, options)).rejects.toThrow();
    expect(d.signWithExtension).toHaveBeenCalledTimes(1);
  });

  it('names the reason the image service gave', async () => {
    const refused = Object.assign(new Error('Request failed with status 400'), {
      status: 400,
      data: { error: { name: 'invalid_image', info: { message: 'unsupported type' } } },
    });
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    await expect(
      uploadEditorImage(png, {
        user: user('hivesigner', { accessToken: 't' }),
        deps: deps(),
        upload: async () => {
          throw refused;
        },
        convert: async (f) => f,
      }),
    ).rejects.toThrow(/invalid image/i);
  });

  it('explains a low-reputation refusal in words', async () => {
    const refused = Object.assign(new Error('Request failed with status 403'), {
      status: 403,
      data: { error: { name: 'deplorable' } },
    });
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    await expect(
      uploadEditorImage(png, {
        user: user('hivesigner', { accessToken: 't' }),
        deps: deps(),
        upload: async () => {
          throw refused;
        },
        convert: async (f) => f,
      }),
    ).rejects.toThrow(/reputation/i);
  });

  it('does not keep a code signed after the account logged out', async () => {
    let signedIn = true;
    const d = deps({
      isCurrentUser: () => signedIn,
      signWithExtension: vi.fn(async () => {
        signedIn = false; // logged out while the wallet prompt was open
        return { result: 'SIG', extension: 'keychain' as const };
      }),
    });
    await expect(getImageUploadToken(user('keychain'), d)).rejects.toThrow(/logged out/i);
    expect(d.storage?.getItem('ecency_image_upload_code')).toBeNull();
  });

  it('asks the wallet once when two uploads start together', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const d = deps({
      signWithExtension: vi.fn(async () => {
        await gate;
        return { result: 'SIG', extension: 'keychain' as const };
      }),
    });
    const both = Promise.all([getImageUploadToken(user('keychain'), d), getImageUploadToken(user('keychain'), d)]);
    release();
    const [a, b] = await both;
    expect(a).toBe(b);
    expect(d.signWithExtension).toHaveBeenCalledTimes(1);
  });

  it('needs a logged-in user', async () => {
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    await expect(
      uploadEditorImage(png, { user: null, deps: deps(), upload: vi.fn(), convert: async (f) => f }),
    ).rejects.toThrow(/log in/i);
  });
});
