// The bootstrap's session guard errors (#2023). In their own module so the chat
// pages can tell them apart by class, whatever mocks the chat API in a spec.

/**
 * Thrown, without a request, when this tab's account is not the one active in
 * the browser (another tab switched): bootstrapping would put this account's
 * chat cookie over the active one's (#2023).
 */
export class ChatAccountInactiveError extends Error {
  /** What the browser has instead: no account, or another one. The UI keys off this. */
  readonly reason: "no-account" | "other-account";

  constructor(browserAccount: string | undefined) {
    super(
      browserAccount
        ? "Another account is active in this browser"
        : "No account is active in this browser"
    );
    this.name = "ChatAccountInactiveError";
    this.reason = browserAccount ? "other-account" : "no-account";
  }
}

/**
 * Thrown, without a request, when a session reset (an account switch in this
 * tab) happened while the bootstrap waited: its result belongs to no one.
 */
export class ChatSessionChangedError extends Error {
  constructor() {
    super("Chat session changed");
    this.name = "ChatSessionChangedError";
  }
}
