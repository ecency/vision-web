---
name: add-sdk-mutation
description: Use when adding or changing a Hive blockchain operation in @ecency/sdk and exposing it to the web app, for requests like "add a mutation for recurrent_transfer", "make delegate_rc broadcastable from the UI", or "add a wrapper under api/sdk-mutations".
argument-hint: [operation-name]
---

# Add SDK Mutation

Layering is in CLAUDE.md under "Mutation Architecture". Copy the real files below.

## 1. SDK mutation hook

`packages/sdk/src/modules/<domain>/mutations/use-<operation>.ts`. Operations come
from `build<Operation>Op` helpers in `modules/operations/builders/` (add one there
if missing, export it from that `index.ts`).

`useBroadcastMutation` arguments are **positional**, in this order: `mutationKey`,
`username`, `operations` (sync, returns the op array), `onSuccess`, `auth`,
`authority`, `options`. There is no options object for authority. From
`packages/sdk/src/modules/wallet/mutations/use-transfer.ts`, doc comments removed
plus the payload interface condensed to one line:

```typescript
import { useBroadcastMutation, invalidateAfterBroadcast } from "@/modules/core/mutations";
import type { BroadcastMode } from "@/modules/core/mutations";
import { QueryKeys } from "@/modules/core";
import type { AuthContextV2 } from "@/modules/core/types";
import { buildTransferOp } from "@/modules/operations/builders";

export interface TransferPayload { to: string; amount: string; memo: string; }

export function useTransfer(
  username: string | undefined,
  auth?: AuthContextV2,
  broadcastMode?: BroadcastMode
) {
  return useBroadcastMutation<TransferPayload>(
    ["wallet", "transfer"],
    username,
    (payload) => [
      buildTransferOp(username!, payload.to, payload.amount, payload.memo)
    ],
    async (_result, variables) => {
      await invalidateAfterBroadcast(auth?.adapter, broadcastMode, [
        QueryKeys.accounts.full(username),
        QueryKeys.accounts.full(variables.to),
        ["ecency-wallets", "asset-info", username],
        ["wallet", "portfolio", "v2", username]
      ]);
    },
    auth,
    'active',
    { broadcastMode }
  );
}
```

Authority is a lowercase string literal from
`type AuthorityLevel = 'posting' | 'active' | 'owner' | 'memo'` in
`modules/operations/authority-map.ts`. It is not an enum: nothing named
`AuthorityLevel.POSTING` exists. It defaults to `'posting'` (social ops); use
`'active'` for transfers, delegations, power up or down plus account updates,
`'owner'` for recovery or key changes. `OPERATION_AUTHORITY_MAP` in that same file
is the per-operation lookup.

Imports as the SDK uses them: `useBroadcastMutation` from `@/modules/core` (31 files)
or `@/modules/core/mutations` (19); `QueryKeys` only from `@/modules/core` (160
files), since `core/mutations` re-exports just the three broadcast helpers;
`AuthContextV2` always as `import type`, from `@/modules/core/types` in 54 of its 55
import sites. `invalidateAfterBroadcast` (24 consumers) already defers about one
block on async broadcasts, so no hand rolled `setTimeout`. Other models:
`posts/mutations/use-vote.ts`, `use-reblog.ts`, `use-comment.ts`. Co-locate a
`use-<operation>.spec.ts` when the hook has logic of its own; most hooks have none,
so copy the pattern from `posts/mutations/use-vote.spec.ts`.

Export with `export * from "./use-<operation>";` in the domain's
`mutations/index.ts`. The chain up to `packages/sdk/src/index.ts` is already wired.

## 2. QueryKeys, if you invalidate

`modules/core/query-keys.ts` is a plain object literal, not a class, so there is no
`static`. Add the builder to its domain namespace:
`withdrawRoutes: (account: string) => ["wallet", "withdraw-routes", account],`.
Some namespaces also carry `_prefix` for broad invalidation. Never hardcode key
arrays, see CLAUDE.md. The two inline arrays in the transfer hook above are the
exception: they are bare prefixes, while `QueryKeys.assets.ecencyAssetInfo` and
`QueryKeys.wallet.portfolio` both take trailing arguments that no builder call can
omit.

## 3. Web wrapper

`apps/web/src/api/sdk-mutations/use-<operation>-mutation.ts`. 48 of the 56 wrappers
call the adapter; 46 of those are exactly this, from `use-transfer-mutation.ts`:

```typescript
"use client";
import { useTransfer } from "@ecency/sdk";
import { getWebBroadcastAdapter } from "@/providers/sdk";
import { useActiveUsername } from "@/core/hooks/use-active-username";

export function useTransferMutation() {
  const username = useActiveUsername();
  const adapter = getWebBroadcastAdapter();
  return useTransfer(username, { adapter });
}
```

Match it: `"use client"`, then `useActiveUsername()` rather than `useActiveAccount()`
(which subscribes to full account data no wrapper needs), then the shared singleton
`getWebBroadcastAdapter()` rather than `createWebBroadcastAdapter`, which no wrapper
calls. The other 2 adapter wrappers keep that core then add orchestration:
`use-proposal-vote-mutation.ts` plus `use-witness-vote-mutation.ts` feed the SDK hook
into their own `useMutation`, which polls the chain for confirmation. The 8 wrappers
with no adapter cover private-API mutations (drafts, images, schedules,
notifications) that never broadcast. Add the named export to
`apps/web/src/api/sdk-mutations/index.ts`.

## 4. Verify

The web app resolves `@ecency/sdk` through `dist`,
so `pnpm typecheck` reports your new export as missing from the package until the SDK
is rebuilt:

```bash
pnpm sdk         # or pnpm build:packages; web typecheck reads dist types, never src
pnpm --filter @ecency/sdk test
pnpm test        # web app; the root script is web-only despite the name
pnpm typecheck && pnpm lint
```

Only typecheck really needs that first line. `pnpm lint` runs `next lint` plus a
per-package `eslint .` with no import resolution rules. `setup-any-spec.ts` mocks
`@ecency/sdk` for every web spec, so only 28 of the 372 spec files reach the built
module, through `vi.importActual("@ecency/sdk")`.

**Never commit `packages/sdk/dist`.** It is tracked in git, so a hand built dist in
your commit buries the real diff in generated output and causes merge conflicts. CI
rebuilds it: `.github/workflows/auto-changeset.yml` fires when a version label is put
on the PR, then pushes the version bump plus the rebuilt dist back to the PR branch.
Do not add those labels yourself; the maintainer applies them. Building it locally is
expected, as in step 4 above; just keep `dist` out of what you stage.

## Gotchas

- Consumers resolve `@ecency/sdk` through `dist` (`package.json` `exports`), with no
  src alias in the web app, so source changes reach the web app only after the
  package is rebuilt: `pnpm build:packages`, or `pnpm sdk` for the SDK alone. Land
  the hook and its wrapper together.
- Keep the SDK lightweight and generic. Toasts, i18n, session storage and error
  formatting stay in web.
- Auth upgrade is automatic: an active-authority op on a posting-key session drives
  `showAuthUpgradeUI` through the adapter. See "Authentication & Broadcasting" in
  CLAUDE.md.
