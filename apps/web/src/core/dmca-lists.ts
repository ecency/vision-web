import { ConfigManager } from "@ecency/sdk";
import dmcaAccounts from "../../public/dmca/dmca-accounts.json";
import dmcaTags from "../../public/dmca/dmca-tags.json";
import { takenDownPostPaths } from "@/core/dmca-posts";

/**
 * Takedown lists, loaded into the SDK config.
 *
 * The SDK's post queries filter against CONFIG, which holds nothing until this
 * runs, so a surface that never calls it is not filtered at all. The call used
 * to live in `core/sdk-init`, which the root layout and the client providers
 * import. App Router ROUTE HANDLERS never execute the root layout, so on a
 * worker that had not yet rendered a page the lists were empty and every
 * takedown was a no-op there: `/@author/permlink.md` and `.json` served listed
 * posts in full (#1862).
 *
 * CALL IT. Never `import "@/core/dmca-lists"` for the side effect: `sideEffects`
 * in apps/web/package.json is an ALLOWLIST (added in e52b060e3a, which warns
 * about exactly this), so every module outside that list is declared
 * side-effect free and webpack drops a bare import of one from the production
 * bundle. A module-top call here would be pruned in the build and nowhere
 * else, leaving vitest, typecheck and `next dev` green while production served
 * every listed post uncensored. A call through a used binding survives
 * whatever the allowlist says.
 *
 * Idempotent, so each entry point can load the policy without knowing whether
 * another already did.
 *
 * Note for spec authors: because the entry points call this at module scope, a
 * spec that imports one of them and mocks `@ecency/sdk` must include
 * `ConfigManager.setDmcaLists` in the mock, or the import throws.
 */
export function loadDmcaLists(): void {
  ConfigManager.setDmcaLists({
    accounts: dmcaAccounts.accounts ?? [],
    tags: dmcaTags.tags ?? [],
    posts: takenDownPostPaths()
  });
}
