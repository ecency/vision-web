/**
 * How long a key entered to sign stays in memory unused: the same sliding
 * window as the session active key (utils/session-active-key.ts). It caps how
 * long an unattended tab keeps signing power, instead of the life of the page.
 */
export const SIGNING_KEY_IDLE_MS = 2 * 60 * 60 * 1000;

export function createSigningKeyState() {
  return {
    signingKey: null as string | null
  };
}

type State = ReturnType<typeof createSigningKeyState>;

export function createSigningKeyActions(
  set: (state: Partial<State>) => void,
  getState: () => State
) {
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  return {
    setSigningKey: (signingKey: string | null) => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      set({ signingKey });
      if (signingKey) {
        idleTimer = setTimeout(() => {
          idleTimer = null;
          if (getState().signingKey === signingKey) {
            set({ signingKey: null });
          }
        }, SIGNING_KEY_IDLE_MS);
      }
    }
  };
}
