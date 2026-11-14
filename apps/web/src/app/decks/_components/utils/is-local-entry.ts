import { Entry } from "@/entities";

/**
 * A wave the user just created and the chain has not confirmed yet. `tempEntry`
 * stamps those with post_id 1 or a uuid. Confirmed posts come from the bridge,
 * which no longer returns a post_id at all, so a missing post_id is NOT local.
 */
export const isLocalEntry = ({ post_id }: Pick<Entry, "post_id">) =>
  post_id === 1 || typeof post_id === "string";
