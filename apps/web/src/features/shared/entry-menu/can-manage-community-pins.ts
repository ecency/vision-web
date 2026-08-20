import { Community, ROLES } from "@/entities";

const PIN_ROLES: string[] = [
  ROLES.OWNER.toString(),
  ROLES.ADMIN.toString(),
  ROLES.MOD.toString()
];

/**
 * Whether this viewer may pin or unpin in this community.
 *
 * Extracted because it is load-bearing twice over: it decides whether the Pin
 * and Unpin menu items appear at all, and it gates the community-page fetch that
 * resolves pin state (see useCommunityPinCache, which is a whole 20-post page).
 * One definition, so the menu and the fetch cannot disagree about who is a
 * moderator.
 */
export function canManageCommunityPins(
  community: Community | null | undefined,
  username: string | undefined
): boolean {
  if (!community || !username) {
    return false;
  }
  return !!community.team?.find((member) => member[0] === username && PIN_ROLES.includes(member[1]));
}
