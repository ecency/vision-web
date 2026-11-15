// Names the account a web chat request or socket is for (#2023). Shared by the
// client and the server routes, so it imports nothing.

/**
 * Request header naming the account this tab's chat request is for. The chat
 * session cookies are shared by every tab, so after another tab switched
 * account they belong to that one; the server refuses them for a request that
 * names another account.
 */
export const CHAT_ACCOUNT_HEADER = "X-Chat-Account";
/** The same for the chat websocket, which cannot send headers. */
export const CHAT_ACCOUNT_QUERY_PARAM = "account";
