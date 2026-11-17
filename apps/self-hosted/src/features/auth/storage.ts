import { HIVEAUTH_KEY, SESSION_DURATION, STORAGE_KEY } from './constants';
import type { AuthUser, HiveAuthSession } from './types';

/**
 * Save user to localStorage
 */
export function saveUser(user: AuthUser): void {
  try {
    const userWithExpiry: AuthUser = {
      ...user,
      expiresAt: user.expiresAt ?? Date.now() + SESSION_DURATION,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userWithExpiry));
  } catch (error) {
    console.error('Failed to save user to localStorage:', error);
  }
}

/**
 * Get user from localStorage
 */
export function getUser(): AuthUser | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const user: AuthUser = JSON.parse(stored);

    // Check if session is expired
    if (user.expiresAt && Date.now() > user.expiresAt) {
      clearUser();
      return null;
    }

    return user;
  } catch (error) {
    console.error('Failed to get user from localStorage:', error);
    return null;
  }
}

/**
 * Clear user from localStorage
 */
export function clearUser(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear user from localStorage:', error);
  }
}

/**
 * Check if session is valid
 */
export function isSessionValid(user: AuthUser | null): boolean {
  if (!user) return false;
  if (!user.expiresAt) return true;
  return Date.now() < user.expiresAt;
}

/**
 * Save HiveAuth session
 */
export function saveHiveAuthSession(session: HiveAuthSession): void {
  try {
    localStorage.setItem(HIVEAUTH_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to save HiveAuth session:', error);
  }
}

/**
 * Get HiveAuth session
 */
export function getHiveAuthSession(): HiveAuthSession | null {
  try {
    const stored = localStorage.getItem(HIVEAUTH_KEY);
    if (!stored) return null;

    const session: HiveAuthSession = JSON.parse(stored);

    // Check if session is expired
    if (session.expire && Date.now() > session.expire * 1000) {
      clearHiveAuthSession();
      return null;
    }

    return session;
  } catch (error) {
    console.error('Failed to get HiveAuth session:', error);
    return null;
  }
}

/**
 * Clear HiveAuth session
 */
export function clearHiveAuthSession(): void {
  try {
    localStorage.removeItem(HIVEAUTH_KEY);
  } catch (error) {
    console.error('Failed to clear HiveAuth session:', error);
  }
}

/**
 * The signed image-upload code (features/publish/utils/image-upload.ts, #1462).
 * Kept here so logout can drop it without the auth feature importing the editor.
 */
export const IMAGE_UPLOAD_CODE_KEY = 'ecency_image_upload_code';

export function clearImageUploadCode(): void {
  try {
    localStorage.removeItem(IMAGE_UPLOAD_CODE_KEY);
  } catch {
    // storage unavailable: nothing was cached
  }
}
