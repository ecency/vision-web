---
paths:
  - "apps/web/**"
  - "packages/sdk/src/**"
  - "apps/self-hosted/src/providers/sdk/**"
---

# Authentication and broadcasting

Multi-method authentication support:
- **Private Key** (`key`) - Direct key signing (posting key stored, active via auth upgrade)
- **Keychain** (`keychain`) - Browser extension integration
- **HiveSigner** (`hivesigner`) - OAuth token-based broadcasting
- **HiveAuth** (`hiveauth`) - QR code + mobile app flow

**Broadcast Adapter Pattern** (`apps/web/src/providers/sdk/web-broadcast-adapter.ts`):

The SDK uses a platform adapter pattern to decouple mutations from auth. The web app provides `createWebBroadcastAdapter()` which implements the `PlatformAdapter` interface:

```
SDK mutation (platform-agnostic)
    ↓ calls adapter methods
Web Broadcast Adapter (web-specific)
    ↓ resolves auth via
localStorage (keys/tokens) → Keychain extension → HiveSigner API → HiveAuth protocol
```

**Smart Auth Strategy** (in SDK's `useBroadcastMutation`):
1. Calls `adapter.getLoginType()` to determine user's auth method
2. For posting ops with granted posting authority: tries HiveSigner token first (faster)
3. Falls back to user's actual auth method if token fails
4. For active ops: shows auth upgrade dialog via `adapter.showAuthUpgradeUI()`

**Auth Upgrade Flow** (`apps/web/src/features/shared/auth-upgrade/`):

When an operation requires active authority but the user logged in with posting key:
1. SDK detects auth failure → calls `adapter.showAuthUpgradeUI()`
2. Web adapter dispatches `ecency-auth-upgrade` CustomEvent
3. Auth upgrade dialog appears, user selects method (enter active key, use Keychain, etc.)
4. Dialog resolves the promise with chosen method + optional active key
5. SDK retries broadcast with the chosen method
6. An active key entered here is held in memory
   (`apps/web/src/utils/session-active-key.ts`) for as long as the page is open,
   on a sliding two hour idle window that every use pushes out. So a run of
   active-authority operations asks for it once, however long the run lasts,
   while an unattended tab drops it. A master password, seed or active-key login
   holds the same key, so those users never see the dialog for an active op.

   Deliberately not `sessionStorage`, which is not the tab-scoped secret it looks
   like: closing a tab does not destroy it (Chrome keeps it for "reopen closed
   tab" and for session restore) and a duplicated tab starts with a copy. A
   module variable dies with the document, never reaches disk and cannot be read
   from another tab. The cost is one prompt after a reload; client-side
   navigation keeps the key. The idle window is gated on a timestamp rather than
   only on the timer, since a background tab's timers are throttled and a
   suspended machine runs none. The record is scoped to the username that entered
   it and checked against the shared `active_user` entry on every read. It is
   dropped on logout, on account switch and whenever a new active-authority
   dialog opens, at which point the held key has already failed to sign.
