import { bridgeApiCall } from "@ecency/sdk";

/** The community as Hive has it, or null when it does not exist or Hive cannot be asked. */
export async function findHiveCommunity(name: string): Promise<{ name: string; title?: string } | null> {
  try {
    const community = await bridgeApiCall<{ name?: string; title?: string } | null>("get_community", { name });
    return community?.name === name ? { name: community.name, title: community.title } : null;
  } catch {
    return null;
  }
}
