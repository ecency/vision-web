"use client";

import { useQuery } from "@tanstack/react-query";
import { getProMembersQueryOptions } from "@ecency/sdk";
import type { Community, CommunityTeam, Entry } from "@/entities";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { isProMember } from "@/features/pro/pro-config";
import { useMemo } from "react";
import { useNewsletterEnabled } from "./runtime";

/**
 * Whether the viewer may send THIS post to a list, and which list (vision-web#1532).
 * Mirrors the server gate (server/newsletter-sender-gate.ts) so the action is
 * only offered where the request would succeed; the server decides for real.
 *
 *   creator: the viewer's own top-level post, and the viewer is an Ecency Pro member.
 *   community: a top-level post made in a community whose owner or admin the viewer is.
 * A post that is both is offered to the community list when the viewer runs it,
 * else to their own list.
 */
export interface SendTarget {
  type: "creator" | "community";
  target: string;
  label: string;
}

const SEND_ROLES = new Set(["owner", "admin"]);
const VIEW_ROLES = new Set(["owner", "admin", "mod"]);

/**
 * The viewer's standing towards a community's digest, from the team roster.
 * Names compared lowercase: the stored username keeps whatever casing was
 * typed, team entries are canonical. Owner, admin and mod may see the digest's
 * standing and history (view); sending mail is heavier than moderating, so
 * owner and admin only (send). The same roles as the server gate.
 */
export function communityDigestRoles(team: CommunityTeam | undefined, username: string | null | undefined): { canView: boolean; canSend: boolean } {
  const me = username?.toLowerCase();
  const role = me ? team?.find((m: (string | undefined)[]) => m[0]?.toLowerCase() === me)?.[1] : undefined;
  return { canView: !!role && VIEW_ROLES.has(role), canSend: !!role && SEND_ROLES.has(role) };
}

export function useAuthorSendTarget(entry: Entry, community?: Community | null): SendTarget | null {
  const enabled = useNewsletterEnabled();
  const { activeUser } = useActiveAccount();
  const me = activeUser?.username?.toLowerCase();
  const isTopLevel = !entry.parent_author && (entry.depth ?? 0) === 0;
  const isOwn = !!me && me === entry.author;
  const { data: pro } = useQuery({ ...getProMembersQueryOptions(), enabled: enabled && isOwn && isTopLevel });

  return useMemo(() => {
    if (!enabled || !me || !isTopLevel) return null;
    if (community && community.name === entry.category && communityDigestRoles(community.team, me).canSend) {
      return { type: "community", target: community.name, label: community.title || community.name };
    }
    if (isOwn && isProMember(pro?.members, me)) return { type: "creator", target: me, label: `@${me}` };
    return null;
  }, [enabled, me, isTopLevel, community, entry.category, isOwn, pro?.members]);
}
