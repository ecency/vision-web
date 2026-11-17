import { uploadImage } from '@ecency/sdk';
import { authenticationStore } from '@/store';
import { HIVESIGNER_CLIENT_ID } from '@/features/auth/constants';
import { getHiveAuthSession, IMAGE_UPLOAD_CODE_KEY } from '@/features/auth/storage';
import type { AuthUser, HiveAuthSession, HiveExtensionId } from '@/features/auth/types';
import {
  isHiveAuthSessionValid,
  signChallengeWithHiveAuth,
} from '@/features/auth/utils/hive-auth';
import { signBufferWithExtension } from '@/features/auth/utils/hive-extensions';
import { extensionCancelledMessage } from '@/features/auth/utils/hosting-token';

/**
 * Image upload for the editor (#1462), through the same image service as
 * ecency.com.
 *
 * The service authenticates an upload with a HiveSigner access token, or with
 * a HiveSigner-style code: `{signed_message: {type: "code", app}, authors,
 * timestamp}` signed with the account's posting key, base64url encoded. That is
 * what ecency.com signs for its Keychain users (`makeHsCode`).
 *
 *  - HiveSigner sessions already hold an access token.
 *  - Keychain (and every other browser extension) and HiveAuth sessions hold
 *    none, so they sign a code on the first upload and reuse it, in
 *    localStorage, until shortly before it expires: one wallet prompt, not one
 *    per image. The same shape as the hosting token in hosting-token.ts.
 */

const STORAGE_KEY = IMAGE_UPLOAD_CODE_KEY;
/**
 * How long a signed code is reused. The image service does not check the
 * code's timestamp, so this is hygiene rather than a deadline: a code is a
 * standing upload credential until the posting key changes, and re-signing
 * weekly bounds how long a copied one stays useful to the cache. It is cleared
 * whenever a session ends (clearUser in features/auth/storage.ts).
 */
export const CODE_LIFETIME_MS = 6 * 24 * 60 * 60 * 1000;

export interface ImageUploadDeps {
  signWithExtension: (
    account: string,
    message: string,
    authority: 'Posting',
    extension?: HiveExtensionId,
  ) => Promise<{ result?: unknown; extension?: HiveExtensionId }>;
  signWithHiveAuth: (session: HiveAuthSession, message: string) => Promise<string>;
  getHiveAuthSession: () => HiveAuthSession | null;
  now: () => number;
  storage: Storage | null;
  /** Whether this account is still the one logged in (it may log out mid-prompt). */
  isCurrentUser: (username: string) => boolean;
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const defaultImageUploadDeps = (): ImageUploadDeps => ({
  signWithExtension: (account, message, authority, extension) =>
    signBufferWithExtension(account, message, authority, extension),
  signWithHiveAuth: (session, message) => signChallengeWithHiveAuth(session, message),
  getHiveAuthSession,
  now: () => Date.now(),
  storage: defaultStorage(),
  isCurrentUser: (username) => authenticationStore.getState().user?.username === username,
});

interface StoredCode {
  username: string;
  code: string;
  signedAt: number;
}

function readCode(deps: ImageUploadDeps, username: string): string | null {
  try {
    const raw = deps.storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredCode;
    if (stored.username !== username || typeof stored.code !== 'string') return null;
    if (deps.now() - stored.signedAt >= CODE_LIFETIME_MS) return null;
    return stored.code;
  } catch {
    return null;
  }
}

function storeCode(deps: ImageUploadDeps, stored: StoredCode): void {
  try {
    deps.storage?.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Private mode or full storage: the next upload signs again.
  }
}

function forgetCode(deps: ImageUploadDeps): void {
  try {
    deps.storage?.removeItem(STORAGE_KEY);
  } catch {
    // nothing to forget
  }
}

/** base64url as ecency.com's b64uEnc writes it: `=` becomes `.`. */
function b64uEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/[+/=]/g, (c) => (c === '+' ? '-' : c === '/' ? '_' : '.'));
}

/** Signatures in flight, so two uploads started together ask the wallet once. */
const signing = new Map<string, Promise<string>>();

/** A token the image service accepts for this session. Throws a readable message. */
export async function getImageUploadToken(
  user: AuthUser | null,
  deps: ImageUploadDeps = defaultImageUploadDeps(),
): Promise<string> {
  if (!user) throw new Error('Log in to upload images.');
  if (user.loginType === 'hivesigner') return sessionToken(user);
  const cached = readCode(deps, user.username);
  if (cached) return cached;
  const pending = signing.get(user.username);
  if (pending) return pending;
  const started = signCode(user, deps).finally(() => signing.delete(user.username));
  signing.set(user.username, started);
  return started;
}

function sessionToken(user: AuthUser): string {
  if (!user.accessToken) {
    throw new Error('Your session has expired. Log in again to upload images.');
  }
  return user.accessToken;
}

async function signCode(user: AuthUser, deps: ImageUploadDeps): Promise<string> {

  const signedAt = deps.now();
  const message = {
    signed_message: { type: 'code', app: HIVESIGNER_CLIENT_ID },
    authors: [user.username],
    timestamp: Math.floor(signedAt / 1000),
  };
  const text = JSON.stringify(message);

  let signature: string;
  if (user.loginType === 'keychain') {
    const signed = await deps.signWithExtension(user.username, text, 'Posting', user.extension);
    if (typeof signed.result !== 'string' || signed.result.length === 0) {
      throw new Error(extensionCancelledMessage(signed.extension));
    }
    signature = signed.result;
  } else {
    const session = deps.getHiveAuthSession();
    if (!session || !isHiveAuthSessionValid(session)) {
      throw new Error('Your HiveAuth session has expired. Log in again to upload images.');
    }
    signature = await deps.signWithHiveAuth(session, text);
  }

  // Logged out while the wallet prompt was open: logout already cleared the
  // cache, so neither store nor use the late signature.
  if (!deps.isCurrentUser(user.username)) {
    throw new Error('You logged out before the signature arrived. Log in again to upload images.');
  }
  const code = b64uEncode(JSON.stringify({ ...message, signatures: [signature] }));
  storeCode(deps, { username: user.username, code, signedAt });
  return code;
}

// What the image service accepts. SVG is not among them: it refuses the upload.
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|heic|heif)$/i;
const IMAGE_TYPES = /^image\/(jpe?g|png|gif|webp|avif|heic|heif)$/i;
const HEIC = /\.(heic|heif)$/i;

/** Value for a file input's `accept`: types plus extensions, as some browsers report no type for HEIC or AVIF. */
export const IMAGE_ACCEPT =
  'image/jpeg,image/png,image/gif,image/webp,image/avif,image/heic,image/heif,' +
  '.jpg,.jpeg,.png,.gif,.webp,.avif,.heic,.heif';

export function isImageFile(file: File): boolean {
  return file.type ? IMAGE_TYPES.test(file.type) : IMAGE_EXTENSIONS.test(file.name);
}

function isHeic(file: File): boolean {
  return file.type === 'image/heic' || file.type === 'image/heif' || HEIC.test(file.name);
}

/** HEIC to JPEG, as ecency.com converts iPhone photos before upload. */
export async function convertHeicToJpeg(file: File): Promise<File> {
  try {
    const heic2any = (await import('heic2any')).default;
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const result = Array.isArray(blob) ? blob[0] : blob;
    return new File([result], file.name.replace(HEIC, '.jpg'), { type: 'image/jpeg' });
  } catch {
    // Upload the original rather than nothing; the service accepts HEIC.
    return file;
  }
}

const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * Some browsers report no type for AVIF or HEIC, and the image service checks
 * the upload's declared type before its bytes, so an untyped file is refused.
 */
function withType(file: File): File {
  if (file.type) return file;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = TYPE_BY_EXTENSION[ext];
  return type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file;
}

export async function prepareImageFile(
  file: File,
  convert: (file: File) => Promise<File> = convertHeicToJpeg,
): Promise<File> {
  if (!isImageFile(file)) {
    throw new Error(`${file.name} is not an image.`);
  }
  return withType(isHeic(file) ? await convert(file) : file);
}

export interface UploadEditorImageOptions {
  user: AuthUser | null;
  deps?: ImageUploadDeps;
  upload?: (file: File, token: string, signal?: AbortSignal) => Promise<{ url: string }>;
  convert?: (file: File) => Promise<File>;
  signal?: AbortSignal;
}

/** Prepare, authenticate and upload one image. Resolves to its URL. */
export async function uploadEditorImage(
  file: File,
  { user, deps = defaultImageUploadDeps(), upload = uploadImage, convert, signal }: UploadEditorImageOptions,
): Promise<string> {
  if (!user) throw new Error('Log in to upload images.');
  const prepared = await prepareImageFile(file, convert);
  const token = await getImageUploadToken(user, deps);
  try {
    // Started here, after the wallet answered: a slow approval must not use up
    // the request's time. A stalled request gives up instead of holding the
    // upload (and Publish) forever.
    const { url } = await upload(prepared, token, signal ?? timeoutSignal(UPLOAD_TIMEOUT_MS));
    return url;
  } catch (e) {
    const reason = serviceErrorName(e);
    // The service answers a signature it cannot verify (a rotated posting key)
    // with 400 invalid_signature: that code must not be reused. Other refusals,
    // such as 403 for a low-reputation account, are not fixed by signing again.
    if (user.loginType !== 'hivesigner' && reason === 'invalid_signature') {
      forgetCode(deps);
    }
    if (reason) {
      const message =
        reason === 'deplorable'
          ? "This account's reputation is too low to upload images."
          : `The image service refused it (${reason.replace(/_/g, ' ')})`;
      throw Object.assign(new Error(message), {
        status: (e as { status?: number }).status,
        data: (e as { data?: unknown }).data,
      });
    }
    throw e;
  }
}

/** The error name in the image service's `{error: {name}}` body, if any. */
function serviceErrorName(e: unknown): string | null {
  const name = (e as { data?: { error?: { name?: unknown } } })?.data?.error?.name;
  return typeof name === 'string' && name ? name : null;
}

/** Long enough for a large photo on a slow line. */
const UPLOAD_TIMEOUT_MS = 120_000;

/** AbortSignal.timeout, with a fallback for browsers that predate it. */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
