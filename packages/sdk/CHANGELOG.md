# Changelog

## 2.3.85

### Patch Changes

- feat: one RC calculation for every surface, priced from the real draft (#1489)

## 2.3.84

### Patch Changes

- feat(sdk): price a comment's RC cost the way the chain does (#1486)

## 2.3.83

### Patch Changes

- fix(sdk): full-size first page for hafah transactions, no initialData seed on notifications (#1427)

## 2.3.82

### Patch Changes

- fix(sdk): stop sending account names the node refuses to parse (#1407)

## 2.3.81

### Patch Changes

- fix(sdk): reach the head of account history and keep the savings fill on its own asset (#1404)

## 2.3.80

### Patch Changes

- fix(sdk): correct account-history pagination and stop dropping requested ops (#1396)

## 2.3.79

### Patch Changes

- quests: refresh after the backend credits an action, and warn on short replies (#1394)

## 2.3.78

### Patch Changes

- SDK: auth.broadcast is not deprecated, and a guard so it is not misread again (#1378)

## 2.3.77

### Patch Changes

- SDK: update useAccountUpdateRecovery to use AuthContextV2 adapter (#1376)

## 2.3.76

### Patch Changes

- Move the search query builder into the SDK (#1353)

## 2.3.75

### Patch Changes

- Reject a successful search body that is not the expected shape (#1351)

## 2.3.74

### Patch Changes

- Give every search query the same error and retry handling (#1348)

## 2.3.73

### Patch Changes

- refactor(sdk): drop the dead hasNextPage page param and stabilise the display select (#1327)

## 2.3.72

### Patch Changes

- fix(sdk): stop ranked-posts pagination at the end of the feed (#1324)

## 2.3.71

### Patch Changes

- fix(sdk): page community subscribers and stop swallowing activity errors (#1293)

## 2.3.70

### Patch Changes

- feat(publish): dictate posts from the editor toolbar (#1286)

## 2.3.69

### Patch Changes

- feat(sdk): transcription hooks and a label for burned points (#1285)

## 2.3.68

### Patch Changes

- feat(sdk): read post tips over GET and align pro-members freshness (#1273)

## 2.3.67

### Patch Changes

- Move the 3Speak beneficiary rule into @ecency/sdk (#1253)

## 2.3.66

### Patch Changes

- Page the full mute list in `getMutedUsersQueryOptions` instead of taking the first 100, and drop its `limit` parameter. The list drives muted-author dimming and comment collapsing, so a truncated one rendered muted accounts as though they were never muted. The parameter also never reached the username-keyed cache entry, so callers requesting different amounts shared one result and mount order decided how much of the list everyone saw. Ships the source fix from #1247, which merged without a release label.

## 2.3.65

### Patch Changes

- fix(sdk): bound query gcTime during SSR at the source (#1246)

## 2.3.64

### Patch Changes

- fix(observer): default to the ecency observer whenever nobody is logged in (#1244)

## 2.3.63

### Patch Changes

- fix(sdk): resolve query client per request instead of per process (#1242)

## 2.3.62

### Patch Changes

- fix(bridge-requests): validate API response as array before resolving posts (#1233)

## 2.3.61

### Patch Changes

- feat(notifications): sync filter tabs and push toggles across all types (#1229)

## 2.3.60

### Patch Changes

- Read the curation hp field instead of the vests alias (#1225)

## 2.3.59

### Patch Changes

- fix(sdk): price engine tokens by held symbol instead of scanning a capped page (#1218)

## 2.3.58

### Patch Changes

- refactor(types): remove the last draft and market-asset casts (#1205)

## 2.3.57

### Patch Changes

- fix(types): correct SDK declarations that understate their payloads (#1189)

## 2.3.56

### Patch Changes

- fix(types): type infinite queries as InfiniteData in SDK factories (#1183)

## 2.3.55

### Patch Changes

- fix(types): make render-helper + wallets typecheck-clean (#1180)

## 2.3.54

### Patch Changes

- ci: add workspace lint gate (pnpm -r lint) + clear last lint errors (#1177)

## 2.3.53

### Patch Changes

- fix: address code-review findings (security, correctness, deps) (#1175)

## 2.3.52

### Patch Changes

- feat(ai-image): recover delivery-pending generations via reused idempotency key (#1173)

## 2.3.51

### Patch Changes

- fix(sdk): prevent unhandled error on mark-notifications-read without auth (#1152)

## 2.3.50

### Patch Changes

- fix(follow-controls): handle null API response for relationships (#1148)

## 2.3.49

### Patch Changes

- Declare the notification image fields on the sdk types (#1143)

## 2.3.48

### Patch Changes

- feat(sdk): send X-Ecency-Client header on search API requests (#1137)

## 2.3.47

### Patch Changes

- fix(accounts): prevent TypeError when RPC returns null for get_accounts (#1132)

## 2.3.46

### Patch Changes

- fix(sdk): handle null RPC response in get-account-full-query-options (#1131)

## 2.3.45

### Patch Changes

- fix(points): handle non-JSON claim response and stop unhandled claim rejections (#1129)

## 2.3.44

### Patch Changes

- fix(sdk): handle RPCError: missing required posting authority in Transaction.broadcast (#1118)

## 2.3.43

### Patch Changes

- docs(sdk): correct module list in README (#1121)

## 2.3.42

### Patch Changes

- chore(sdk,web): remove decommissioned hapi.ecency.com references (#1119)

## 2.3.41

### Patch Changes

- fix(sdk): cross-validate account metadata and never shrink profile merge base (#1115)

## 2.3.40

### Patch Changes

- Support Ecency: beneficiary preference and curation holdback settings (#1111)

## 2.3.39

### Patch Changes

- fix(sdk): skip vote cache update when entry already reflects the vote (#1096)

## 2.3.38

### Patch Changes

- feat(pro): purchasable Ecency Pro membership and profile badge (#1095)

## 2.3.37

### Patch Changes

- Add scheduled posts to the notifications filter menu (#1091)

## 2.3.36

### Patch Changes

- Add scheduled post published notification type (#1089)

## 2.3.35

### Patch Changes

- Streak Freeze: buy UI + SDK (#1081)

## 2.3.34

### Patch Changes

- fix: integer adaptive timeout delay (sdk) + stuck notifications sidebar (ui) (#1070)

## 2.3.33

### Patch Changes

- feat(sdk): adaptive read timeouts + budgeted hedged reads for tail latency (#1069)

## 2.3.32

### Patch Changes

- fix(sdk): drop hapi from restNodes default (+ techcoderx; add syncad) (#1064)

## 2.3.31

### Patch Changes

- Remove SPK Network support (#1063)

## 2.3.30

### Patch Changes

- fix(sdk): keep every pinned entry in ranked community feeds (#1061)

## 2.3.29

### Patch Changes

- feat(sdk): REST-node runtime config, escalating 429 backoff, and getAccountFull round-trip reduction (#1056)

## 2.3.28

### Patch Changes

- feat(waves): Shorts (reels) tab + SDK shorts feed query (#1039)

## 2.3.27

### Patch Changes

- fix: prevent unhandled rejections from missing account and failed post-link lookups (#1038)

## 2.3.26

### Patch Changes

- feat(waves): show tip count + already-tipped state in the waves feed (#1031)

## 2.3.25

### Patch Changes

- fix: restore snippet edit + optimistic wave vote updates (#1016)

## 2.3.24

### Patch Changes

- waves: server-side observer mute filter + author feed param (#1006)

## 2.3.23

### Patch Changes

- waves: single combined cross-container feed (#1004)

## 2.3.22

### Patch Changes

- fix(waves): guard get_discussion so one failed container can't empty the For-you feed (#992)

## 2.3.21

### Patch Changes

- feat: Resource Credits pre-publish check + RC top-up purchase client (#978)

## 2.3.20

### Patch Changes

- fix(sdk): preserve unrelated metadata on account_update2 writes (#976)

## 2.3.19

### Patch Changes

- fix(waves): publish time on custom feeds + tag selection on Following (#974)

## 2.3.18

### Patch Changes

- feat(waves): show payout + correct vote count on waves cards (#971)

## 2.3.17

### Patch Changes

- fix(sdk): classify "missing required active/owner authority" for auth fallback (#967)

## 2.3.16

### Patch Changes

- feat(sdk): label server-side Hive requests with a real User-Agent (#962)

## 2.3.15

### Patch Changes

- fix(entry-stats): date-scope + canonical-path Plausible queries (#943)

## 2.3.14

### Patch Changes

- fix(sdk): adaptive node selection — cold-start order + caller-abort handling (#927)

## 2.3.12

### Patch Changes

- Latency-aware adaptive node selection in hive-tx (#924)

## 2.3.11

### Patch Changes

- Spotlight: guests-only audience (replace auth boolean) (#917)

## 2.3.10

### Patch Changes

- Add Spotlight type and getSpotlightsQueryOptions to @ecency/sdk (#912)

## 2.3.9

### Patch Changes

- Server-side CAPTCHA: Turnstile on free signup (+ web 4.4.0) (#910)

## 2.3.8

### Patch Changes

- test(sdk): cover similar-entries timeout split + fix retry comment (#905)

## 2.3.7

### Patch Changes

- perf(web): bound similar-entries client fetch, lazy comment composer, fix emoji loading (#852)

## 2.3.6

### Patch Changes

- Sequential fallback for parallel 3Speak uploads (#847)

## 2.3.5

### Patch Changes

- Read-next: short SSR timeout for /similar (#844)

## 2.3.4

### Patch Changes

- Read next: Elasticsearch More Like This + SSR prefetch (#841)

## 2.3.3

### Patch Changes

- Leaderboard: badge for completing all daily quests (#839)

## 2.3.1

### Patch Changes

- feat(entry-stats): reload-proof Views (visits) + entry-page avg visit duration (#832)

## 2.3.0

### Minor Changes

- [#830](https://github.com/ecency/vision-next/pull/830) [`0b0c8c6`](https://github.com/ecency/vision-next/commit/0b0c8c6cc1fa8b286fe679f73599ac5cb14eb349) Thanks [@feruzm](https://github.com/feruzm)! - Remove discontinued post-boost operation builders (`buildBoostOp`, `buildBoostOpWithPoints`). The post-boost feature (paying points to get a post upvoted) was discontinued; the backend no longer processes the `ecency_boost` custom_json, so these builders were dead code. Account Boost+ (`buildBoostPlusOp`) and Promote (`buildPromoteOp`) are unaffected.

### Patch Changes

- chore: remove discontinued post-boost operations (#830)

## 2.2.22

### Patch Changes

- fix(keychain): surface real broadcast errors and retry via a known-good node (#823)

## 2.2.20

### Patch Changes

- fix(sdk): broadcast failover for browser errors + similar-entries limit (#817)

## 2.2.19

### Patch Changes

- fix(sdk): widen hive-tx retry budget and deprioritise deathwing in public-nodes (#812)

## 2.2.18

### Patch Changes

- Memo encryption + similar-entries thumbnail/body fix (#805)

## 2.2.17

### Patch Changes

- fix(similar-entries): correct full_posts, merge both sources, render ≥2, pin HiveSense nodes (#804)

## 2.2.16

### Patch Changes

- SEO: stale-preserving guard for posts/authors sitemap + patient RPC (#802)

## 2.2.15

### Patch Changes

- Similar content improved (#794)

## 2.2.14

### Patch Changes

- Render helper fix, Wallet improvements (#793)

## 2.2.13

### Patch Changes

- fix(images): serve images via SNI-resilient i.ecency.com host (#791)

## 2.2.12

### Patch Changes

- Search and key verification fix (#789)

## 2.2.11

### Patch Changes

- Send idempotency_key on AI assist POST (#786)

## 2.2.10

### Patch Changes

- Fix transaction id extraction (#768)

## 2.2.9

### Patch Changes

- Aggragated balance customizing (#767)

## 2.2.8

### Patch Changes

- Pagination fix witness voters (#766)

## 2.2.7

### Patch Changes

- Balance analytics, unified polls (#765)

## 2.2.6

### Patch Changes

- Broadcast mode in SDK (#764)

## 2.2.5

### Patch Changes

- Unify browser extensions (#763)

## 2.2.4

### Patch Changes

- SDK broadcast timeout separated (#762)

## 2.2.3

### Patch Changes

- Separate entry hive on SDK (#761)

## 2.2.0

### Minor Changes

- Unify and improve SDK (#760)

## 2.1.12

### Patch Changes

- Unify and improve SDK (#760)

## 2.1.8

### Patch Changes

- LCP image src set (#755)

## 2.1.7

### Patch Changes

- React 19 upgrade (#751)

## 2.1.6

### Patch Changes

- Waves X embed fix on Decks (#747)

## 2.1.5

### Patch Changes

- Parallelize requests, improve abort logic (#746)

## 2.1.4

### Patch Changes

- Fix refresh token signature stringify (#745)

## 2.1.3

### Patch Changes

- Abort stuck queries (#744)

## 2.1.2

### Patch Changes

- Fix bootstrap (#741)

## 2.1.1

### Patch Changes

- Cache (#740)

## 2.1.0

### Minor Changes

- Hive-tx migration/test (#739)

## 2.0.35

### Patch Changes

- Thumbnail Waves and hivesigner fix (#728)

## 2.0.34

### Patch Changes

- My waves, your waves and keychain mobile login (#723)

## 2.0.33

### Patch Changes

- Real time comment indicator (#720)

## 2.0.32

### Patch Changes

- Manage/add keys improved (#717)

## 2.0.30

### Patch Changes

- Bad actors in SDK (#708)

## 2.0.28

### Patch Changes

- Metamask integration, Signup simplified, Login changes (#705)

## 2.0.27

### Patch Changes

- Search improvements (#703)

## 2.0.25

### Patch Changes

- AI Assists (#700)

## 2.0.24

### Patch Changes

- Fix fragments and sdk (#697)

## 2.0.22

### Patch Changes

- Expiring delegations (#694)
- Improve adapter (#693)

## 2.0.21

### Patch Changes

- Fallback of RPC selection (#692)

## 2.0.20

### Patch Changes

- SDK fix activity (#684)

## 2.0.19

### Patch Changes

- Fix defaults and null case (#683)

## 2.0.18

### Patch Changes

- Image generation (#680)

## 2.0.17

### Patch Changes

- Version bumps (#678)

## 2.0.16

### Patch Changes

- Server fallbacks, image saving (#677)

## 2.0.15

### Patch Changes

- Improve account update and chat cleanup (#676)

## 2.0.14

### Patch Changes

- Query max pages (#675)

## 2.0.13

### Patch Changes

- Better memory optimizations (#674)

## 2.0.12

### Patch Changes

- Fix invalidation (#672)

## 2.0.11

### Patch Changes

- My favorites widget (#670)

## 2.0.10

### Patch Changes

- Fix points transfer (#669)

## 2.0.9

### Patch Changes

- Performance optimizations (#667)

## 2.0.7

### Patch Changes

- Fix assets list (#664)

## 2.0.6

### Patch Changes

- Marking notification, joining community fixes (#663)

## 2.0.5

### Patch Changes

- SDK error catching (#660)

## 2.0.4

### Patch Changes

- Test and edge case fixes (#659)

## 2.0.3

### Patch Changes

- Fix: Friends active data (#656)

## 2.0.2

### Patch Changes

- Wallets simplified, SDK Mutations unified (#653)

## 2.0.1

### Patch Changes

- Fix optimistic replies (#652)
- Optimistic updates (#651)

## 2.0.0

### Major Changes

This is a major release that introduces the Smart Auth Strategy system, significantly improving authentication performance and user experience.

#### Breaking Changes

- **PlatformAdapter.showAuthUpgradeUI return type changed**
  - **Before:** `Promise<'hiveauth' | 'hivesigner' | false>`
  - **After:** `Promise<'hiveauth' | 'hivesigner' | 'key' | false>`
  - **Reason:** Added support for manual key entry option in auth upgrade flow
  - **Migration:** Update `showAuthUpgradeUI` implementations to handle `'key'` return value
  - **Important:** The return type is intentionally limited to the **most common fallback methods**:
    - `'hiveauth'` - QR code + mobile app authentication
    - `'hivesigner'` - OAuth-based authentication
    - `'key'` - Manual key entry (temporary use)
    - `false` - User cancelled
  - **Note:** While `broadcastWithMethod()` supports all auth methods (`'key' | 'hiveauth' | 'hivesigner' | 'keychain' | 'custom'`), the auth upgrade UI intentionally only offers the above subset for better UX. If you need to support additional methods like `'keychain'` or `'custom'` in the upgrade flow:
    1. Update the return type in `PlatformAdapter.showAuthUpgradeUI` (packages/sdk/src/modules/core/types/platform-adapter.ts)
    2. The handler in `broadcastWithMethod()` (packages/sdk/src/modules/core/mutations/use-broadcast-mutation.ts) will automatically support it - no code changes needed there
  - **See:** `showAuthUpgradeUI` in platform-adapter.ts and `broadcastWithMethod()` in use-broadcast-mutation.ts for implementation details

#### New Features

**Smart Auth Strategy**

- Added `getLoginType()` to PlatformAdapter for determining user's actual auth method
- Eliminated blind fallback chains - now uses user's specific auth method directly
- 2-4x performance improvement (no unnecessary auth attempts)
- Predictable behavior with better error messages

**Authority Detection System**

- New `OPERATION_AUTHORITY_MAP` with 61 operations mapped to authority levels
- Automatic detection of `posting` | `active` | `owner` | `memo` requirements
- `getRequiredAuthority(operation)` helper for authority lookup
- `getProposalAuthority(operation)` for content-dependent operations

**Enhanced Platform Adapter**

- Added `hasPostingAuthorization(username)` - Check if ecency.app has posting authority
- Added `showAuthUpgradeUI(authority, operation)` - Prompt user for auth upgrade
- Added `grantPostingAuthority(username)` - Automatically grant posting authority
- Added `getOwnerKey(username)` - Optional owner key retrieval
- Added `getMemoKey(username)` - Optional memo key retrieval

**Operation Builders**

- New `buildAccountUpdateOp()` - Construct account_update operations
- Type-safe operation construction with Authority types

#### Performance Improvements

- **50% reduction in credential fetches** - Eliminated duplicate key/token fetching in fallback chain
- **Pre-fetch optimization** - Keys and tokens fetched once and reused
- **Faster auth upgrades** - No redundant HiveSigner token fetching

#### Bug Fixes

- Fixed missing operations in authority map (5 operations added)
- Fixed empty operations array crash with guard check
- Fixed authority guard for legacy auth to prevent silent failures
- Fixed owner/memo key checks in fallback chain
- Enhanced error pattern matching (now checks both error.error_description and error.message)
- Improved mutation resilience (recordActivity errors won't block cache invalidation)

#### Developer Experience

- Added comprehensive JSDoc documentation for all new methods
- Created mobile broadcast adapter reference implementation
- Established web broadcast adapter pattern
- All 250 tests passing with new features
- Bundle size impact: +1.8KB for major functionality improvement

### Migration Guide

**For Mobile Apps:**

```typescript
// Update your mobile adapter to implement new methods
export function createMobileBroadcastAdapter(): PlatformAdapter {
  return {
    // ... existing methods ...

    // NEW: Add these methods
    getOwnerKey: async (username) => {
      /* implementation */
    },
    getMemoKey: async (username) => {
      /* implementation */
    },
    hasPostingAuthorization: async (username) => {
      /* implementation */
    },
    showAuthUpgradeUI: async (authority, operation) => {
      // Must now return 'hiveauth' | 'hivesigner' | 'key' | false
    },
    grantPostingAuthority: async (username) => {
      /* implementation */
    },
  };
}
```

**For Web Apps:**

```typescript
// Create web adapter following established pattern
import { createWebBroadcastAdapter } from "@/providers/sdk";

// In your mutation hooks
export function useVoteMutation() {
  const { activeUser } = useActiveAccount();
  const adapter = createWebBroadcastAdapter();

  return useVote(activeUser?.username, { adapter });
}
```

---

## 1.5.28

### Patch Changes

- SDK mutation hooks and adapters (#648)

## 1.5.27

### Patch Changes

- Insights fix (#644)

## 1.5.26

### Patch Changes

- Fix insights (#642)

## 1.5.25

### Patch Changes

- Missing methods on SDK (#641)

## 1.5.24

### Patch Changes

- Improve sdk and bug fixes (#639)

## 1.5.23

### Patch Changes

- Version bump (#638)

## 1.5.22

### Patch Changes

- [#635](https://github.com/ecency/vision-next/pull/635) [`de07860`](https://github.com/ecency/vision-next/commit/de0786095e6f51447898d0ec6b0e3e0cc9434c19) Thanks [@feruzm](https://github.com/feruzm)! - External importing and missing sdk (#635)

## 1.5.0

### Breaking changes

- Require caller-supplied access tokens for private API queries and mutations (e.g., drafts, schedules, images, gallery images).
- Update fragments APIs to accept access tokens: `useAddFragment(username, code)`, `useEditFragment(username, fragmentId, code)`, `useRemoveFragment(username, fragmentId, code)`, and `getFragmentsQueryOptions(username, code)`.
- Require access tokens for query options such as `getDraftsQueryOptions`, `getSchedulesQueryOptions`, `getImagesQueryOptions`, and `getGalleryImagesQueryOptions`.
- Require caller-supplied auth data for broadcast helpers instead of reading from SDK storage (e.g., posting key/login type for `broadcastJson` and `useBroadcastMutation`).
