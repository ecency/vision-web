/**
 * Who may pin and unpin in a chat channel. Shared by the pin route (which
 * enforces it) and the message actions (which show Pin only when it holds).
 *
 * - A community channel: its moderators (owner, admin, mod).
 * - A direct message: either of its two people.
 * - Anything else (a group message, a private channel): nobody, unless the
 *   viewer moderates it, which only a community channel grants.
 */
export function canPinInChannel({
  type,
  isMember,
  canModerate
}: {
  type: string | undefined;
  isMember: boolean;
  canModerate: boolean;
}): boolean {
  if (canModerate) return true;
  return type === "D" && isMember;
}
