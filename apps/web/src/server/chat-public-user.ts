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

function scrubEncoded<T>(value: unknown, scrub: (decoded: T) => T): unknown {
  if (typeof value === "string") return JSON.stringify(scrub(JSON.parse(value) as T));
  return value && typeof value === "object" ? scrub(value as T) : value;
}

type ThreadPayload = { participants?: unknown[] } & Record<string, unknown>;

/**
 * Rewrites an upstream websocket text frame before it reaches a client.
 * Mattermost sends full user records in `user_updated` (data.user) and in
 * `thread_updated` (data.thread.participants); clients only need the public
 * profile. Every other frame passes through untouched (the same string
 * instance is returned). Payloads may be objects or JSON strings, and keep
 * whichever form they arrived in.
 */
export function scrubChatSocketFrame(text: string): string {
  const isUserUpdate = text.includes('"user_updated"');
  const isThreadUpdate = text.includes('"thread_updated"');
  if (!isUserUpdate && !isThreadUpdate) return text;
  try {
    const message = JSON.parse(text);
    if (message?.event === "user_updated" && message.data?.user) {
      message.data.user = scrubEncoded<object>(message.data.user, toPublicChatUser);
      return JSON.stringify(message);
    }
    if (message?.event === "thread_updated" && message.data?.thread) {
      message.data.thread = scrubEncoded<ThreadPayload>(message.data.thread, (thread) =>
        Array.isArray(thread.participants)
          ? {
              ...thread,
              participants: thread.participants.map((user) =>
                user && typeof user === "object" ? toPublicChatUser(user) : user
              )
            }
          : thread
      );
      return JSON.stringify(message);
    }
    return text;
  } catch {
    return text;
  }
}
