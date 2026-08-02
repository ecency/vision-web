// Storage keys
export const STORAGE_KEY = 'ecency_selfhost_user';
export const HIVEAUTH_KEY = 'ecency_selfhost_hiveauth';

// Hivesigner OAuth
export const HIVESIGNER_CLIENT_ID = 'ecency.app';
export const HIVESIGNER_OAUTH_URL = 'https://hivesigner.com/oauth2/authorize';
export const HIVESIGNER_TOKEN_URL = 'https://hivesigner.com/api/oauth2/token';
export const HIVESIGNER_ME_URL = 'https://hivesigner.com/api/me';
export const HIVESIGNER_SCOPE = 'vote,comment,custom_json';
// A FIXED path, not the page login started from. OAuth matches redirect_uri
// exactly, so sending origin + pathname produced a different URI per page and
// none of them could realistically be registered on the app.
export const HIVESIGNER_REDIRECT_PATH = '/auth';
/** sessionStorage key holding the OAuth state nonce for the in-flight login. */
export const HIVESIGNER_STATE_KEY = 'ecency_selfhost_hs_state';

// HiveAuth
// The HAS server. `hiveauth.arcange.eu` does not resolve, so the socket could
// never open and login failed before the protocol was even reached.
export const HIVEAUTH_API = 'wss://hive-auth.arcange.eu';
export const HIVEAUTH_APP = 'ecency.selfhost';
export const HIVEAUTH_KEY_PREFIX = 'ecency_ha_';

// Session duration (7 days in ms)
export const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

// Auth method labels
export const AUTH_METHOD_LABELS: Record<string, string> = {
  hivesigner: 'Hivesigner',
  keychain: 'Browser extension',
  hiveauth: 'HiveAuth',
};

// Auth method descriptions
export const AUTH_METHOD_DESCRIPTIONS: Record<string, string> = {
  hivesigner: 'Login with your Hive account via Hivesigner',
  keychain: 'Sign with Hive Keeper, Keychain or Peak Vault',
  hiveauth: 'Scan QR code with HiveAuth mobile app',
};
