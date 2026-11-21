import { RAIDSTEAD_API } from "@/features/raidstead/api-base";
import { loadSession } from "@/features/raidstead/client";
import { createAdventApi } from "./advent-api";

// The Advent Calendar lives on the same games API as Raidstead and signs in
// with the same game session.
export const adventApi = createAdventApi({
  base: RAIDSTEAD_API,
  token: () => loadSession()?.token ?? null
});
