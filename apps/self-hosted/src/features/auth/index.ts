// Types
export type { AuthMethod, AuthUser, AuthContextValue, AuthConfig, HiveAuthSession } from './types';

// Standalone actions (use these directly; no context needed)
export { login, loginWithHivesigner, logout, broadcast } from './auth-actions';

// Provider
export { AuthProvider, AuthContext } from './auth-provider';

// Hooks
export {
  useAuth,
  useIsAuthenticated,
  useIsAuthEnabled,
  useIsBlogOwner,
  useCurrentUser,
  useBroadcast,
  useAvailableAuthMethods,
} from './hooks';

// Constants
export {
  STORAGE_KEY,
  HIVEAUTH_KEY,
  HIVESIGNER_CLIENT_ID,
  HIVESIGNER_OAUTH_URL,
  HIVESIGNER_SCOPE,
  AUTH_METHOD_LABELS,
  AUTH_METHOD_DESCRIPTIONS,
} from './constants';

// Utils
export { isKeychainAvailable } from './utils/keychain';
export {
  getDetectedExtensions,
  getExtensionName,
  hasAnyHiveExtension,
  hasKeychainLikeExtension,
} from './utils/hive-extensions';
export { isHivesignerCallback, parseHivesignerCallback } from './utils/hivesigner';
export { AUTH_METHODS, availableAuthMethods, orderAuthMethods } from './utils/auth-methods';
export { isHiveAuthSessionValid } from './utils/hive-auth';

// Components
export { VoteButton } from './components/vote-button';
export { CommentForm } from './components/comment-form';
export { UserMenu } from './components/user-menu';
export { CreatePostButton } from './components/create-post-button';
export { ReblogButton } from './components/reblog-button';
