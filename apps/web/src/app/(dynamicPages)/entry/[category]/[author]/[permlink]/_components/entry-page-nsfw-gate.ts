import { Entry } from "@/entities";

/**
 * Should the post body be hidden behind the NSFW click-to-reveal gate?
 *
 * Deliberately the literal-tag check the gate has always used, NOT the broader
 * `isNsfwEntry()` (which also matches NSFW communities and title stems). Using
 * that here would start gating posts that carry no nsfw tag today — a behaviour
 * change worth its own decision, not one to fold into a rendering optimisation.
 *
 * Shared by the server (which decides whether to mount the client gate at all,
 * see #1538) and by the client gate itself, so the two can never disagree.
 */
export function needsNsfwGate(entry: Pick<Entry, "json_metadata">): boolean {
  const tags = entry.json_metadata?.tags;
  return Array.isArray(tags) && tags.includes("nsfw");
}
