import { bridgeApiCall } from "@ecency/sdk";

/** The community as Hive has it, or null when it does not exist or Hive cannot be asked. */
export async function findHiveCommunity(
  name: string,
  signal?: AbortSignal
): Promise<{ name: string; title?: string } | null> {
  try {
    const community = await bridgeApiCall<{ name?: string; title?: string } | null>(
      "get_community",
      { name },
      signal
    );
    return community?.name === name ? { name: community.name, title: community.title } : null;
  } catch {
    return null;
  }
}

/** Communities whose title or description matches the query, best ranked first. Empty when Hive cannot be asked. */
export async function searchHiveCommunities(
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<{ name: string; title?: string }[]> {
  try {
    const communities = await bridgeApiCall<{ name?: string; title?: string }[] | null>(
      "list_communities",
      { query, limit },
      signal
    );
    return (communities ?? [])
      .filter((c): c is { name: string; title?: string } => typeof c?.name === "string")
      .map((c) => ({ name: c.name, title: c.title }));
  } catch {
    return [];
  }
}
