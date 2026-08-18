"use client";

import { useQuery } from "@tanstack/react-query";
import { getProMembersQueryOptions } from "@ecency/sdk";
import type { Community, Entry } from "@/entities";
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

export function useAuthorSendTarget(entry: Entry, community?: Community | null): SendTarget | null {
  const enabled = useNewsletterEnabled();
  const { activeUser } = useActiveAccount();
  const me = activeUser?.username?.toLowerCase();
  const isTopLevel = !entry.parent_author && (entry.depth ?? 0) === 0;
  const isOwn = !!me && me === entry.author;
  const { data: pro } = useQuery({ ...getProMembersQueryOptions(), enabled: enabled && isOwn && isTopLevel });

  return useMemo(() => {
    if (!enabled || !me || !isTopLevel) return null;
    if (community && community.name === entry.category) {
      const role = community.team?.find((m: (string | undefined)[]) => m[0]?.toLowerCase() === me)?.[1];
      if (role && SEND_ROLES.has(role)) return { type: "community", target: community.name, label: community.title || community.name };
    }
    if (isOwn && isProMember(pro?.members, me)) return { type: "creator", target: me, label: `@${me}` };
    return null;
  }, [enabled, me, isTopLevel, community, entry.category, isOwn, pro?.members]);
}
