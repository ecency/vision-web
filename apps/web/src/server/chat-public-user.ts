// Kept free of server dependencies so the websocket proxy can use it too.

const PRIVATE_USER_FIELDS = [
  "props",
  "notify_props",
  "email",
  "auth_data",
  "auth_service",
  "timezone"
] as const;

type PrivateUserField = (typeof PRIVATE_USER_FIELDS)[number];

/**
 * A Mattermost user as other chat users get to see it: everything except
 * account settings and private fields. Apply before returning any user record
 * that is not the caller's own.
 */
export function toPublicChatUser<T extends object>(user: T): Omit<T, PrivateUserField> {
  const copy = { ...user } as Record<string, unknown>;
  for (const field of PRIVATE_USER_FIELDS) delete copy[field];
  return copy as Omit<T, PrivateUserField>;
}

/**
 * Rewrites an upstream websocket text frame before it reaches a client.
 * Mattermost broadcasts `user_updated` to every connected client with the
 * full user record; the clients only need the public profile. Every other
 * frame passes through untouched (the same string instance is returned).
 */
export function scrubChatSocketFrame(text: string): string {
  if (!text.includes('"user_updated"')) return text;
  try {
    const message = JSON.parse(text);
    if (message?.event !== "user_updated" || !message.data?.user) return text;
    const encoded = typeof message.data.user === "string";
    const user = encoded ? JSON.parse(message.data.user) : message.data.user;
    const scrubbed = toPublicChatUser(user);
    message.data.user = encoded ? JSON.stringify(scrubbed) : scrubbed;
    return JSON.stringify(message);
  } catch {
    return text;
  }
}
