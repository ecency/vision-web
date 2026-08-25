# @ecency/render-helper

## 2.5.30

### Patch Changes

- Tiered post-image loading: first three eager, high hint exclusive to the LCP image (#1673)

## 2.5.29

### Patch Changes

- render-helper: fast thumbnail lookup, thumbnails first, memoized nulls (#1611)

## 2.5.28

### Patch Changes

- render-helper: decode entities with entities instead of he (#1606)

## 2.5.27

### Patch Changes

- render-helper: make the node build loadable by plain Node (#1566)

## 2.5.26

### Patch Changes

- Self-hosted: send "View this post on Hive" to Ecency, not hivehub.dev (#1375)

## 2.5.25

### Patch Changes

- feat(render-helper): render author and tag chips inert on self-hosted blogs (#1277)

## 2.5.24

### Patch Changes

- fix(render-helper): proxy legacy hive/steemit images through /p/ (#1256)

## 2.5.23

### Patch Changes

- fix(renderer): embed Odysee watch links and revive dead video placeholders (#1250)

## 2.5.22

### Patch Changes

- fix(render-helper): close embed host spoofing and link policy bypasses (#1186)

## 2.5.21

### Patch Changes

- fix(hosting): dotted Hive account names + Buffer crash in image proxy (#1184)

## 2.5.20

### Patch Changes

- fix(types): make render-helper + wallets typecheck-clean (#1180)

## 2.5.19

### Patch Changes

- fix(render-helper): preserve first-image URLs containing a literal [ (#1178)

## 2.5.18

### Patch Changes

- fix(render-helper): make markdown-link image scan linear (no ReDoS) (#1176)

## 2.5.17

### Patch Changes

- Remove Hive account and Hive post chip labels from rendered content (#1043)

## 2.5.16

### Patch Changes

- Recognize snapie.io and hivesuite.app post links (#1021)

## 2.5.15

### Patch Changes

- fix(render-helper): stop Skatehive IPFS videos autoplaying in waves (#1012)

## 2.5.14

### Patch Changes

- Liketu Speak: audio player, footer cleanup, indexability (#1005)

## 2.5.13

### Patch Changes

- fix: don't autoplay videos in waves feed (#965)

## 2.5.12

### Patch Changes

- Security hardening: embed sanitization, CSP, Mattermost admin authz, import proxy (#945)

## 2.5.11

### Patch Changes

- render-helper: cache-safe <picture> per-format image negotiation (web/self-hosted) (#928)

## 2.5.10

### Patch Changes

- fix: build post links in bare /@author/permlink form (#886)

## 2.5.9

### Patch Changes

- feat(render-helper): strip First Context attribution footer in cleanReply (#858)

## 2.5.8

### Patch Changes

- fix(render-helper): proxy ecency uploads so resize, srcset, blur & WebP/AVIF apply (#856)

## 2.5.7

### Patch Changes

- feat(render-helper): support Skatehype video embeds (#851)

## 2.5.6

### Patch Changes

- security: close 115 of 136 open CodeQL alerts on develop (#813)

## 2.5.5

### Patch Changes

- build(deps): bump the npm_and_yarn group across 2 directories with 16 updates (#806)

## 2.5.4

### Patch Changes

- perf(cwv): cut hydration-time JS & fix LCP image preload (mobile Core Web Vitals) (#795)

## 2.5.3

### Patch Changes

- Render helper fix, Wallet improvements (#793)

## 2.5.2

### Patch Changes

- fix(images): serve images via SNI-resilient i.ecency.com host (#791)

## 2.5.1

### Patch Changes

- Block ReDoS regexes via eslint-plugin-regexp in render-helper (#784)

- [#784](https://github.com/ecency/vision-next/pull/784) [`6e281b4`](https://github.com/ecency/vision-next/commit/6e281b453d51ab4f8dfb67be1bb57b383bb54279) Thanks [@feruzm](https://github.com/feruzm)! - Add `eslint-plugin-regexp` to the render-helper lint pipeline with
  `regexp/no-super-linear-backtracking` and `regexp/no-super-linear-move`
  set to `error`. The package processes untrusted user-authored markdown
  on the SSR hot path; a single super-linear regex is enough to pin Node
  for tens of seconds (see #782). Adding these rules to the package's
  own ESLint config means the next ReDoS-shaped pattern fails CI at PR
  time instead of in production.

  This PR also clears every super-linear regex finding the new rules
  surfaced in real source code, in addition to introducing the rules:
  - Three new linear-time helpers in `helper.ts` (`stripHtmlTags`,
    `trimTrailingSlash`, `stripQueryString`) replace six bounded-input
    regex sites that previously tripped `no-super-linear-move`.
  - The two URL regexes in `consts/regexes.const.ts` (`POST_REGEX`,
    `INTERNAL_POST_TAG_REGEX`) are anchored and use `[^/]+` for fixed
    path segments, eliminating the exchange-style backtracking while
    preserving the previous matching semantics — including the
    single-segment-middle constraint that the WHITE_LIST check in
    `a.method.ts` used to enforce indirectly.
  - The `endPattern` cleanup in `methods/markdown-to-html.method.ts` was
    replaced with a non-regex helper
    (`moveBlockClosingTagOutOfParagraph`) that anchors on `</p>` via
    `indexOf` and walks back over whitespace and an optional `<br>`.
    Same behaviour as the regex; linear time on whitespace-heavy inputs.

  After this PR there are no `regexp/*` disables remaining in
  `packages/render-helper/src/`.

## 2.5.0

### Minor Changes

- [#783](https://github.com/ecency/vision-next/pull/783) [`d443245`](https://github.com/ecency/vision-next/commit/d443245b4c98940c5a2510e792a74346f7f3eaf8) Thanks [@feruzm](https://github.com/feruzm)! - Add a slow-render warning to `markdown2Html`. When a single render takes
  500 ms or longer on the server, the function logs a
  `[render-helper] slow markdown render: …ms author=@… permlink=… body_len=…`
  line to `console.warn`. This surfaces both pathological inputs (e.g.
  ReDoS-prone tag attributes) and merely-slow ones (huge bodies hitting
  the xmldom fallback) from regular container logs without waiting for
  the SSR watchdog to kill a container.

  Cache hits are not timed. Default is **server-on, browser-off** — the
  string overload is called from comment/draft preview paths with
  unpublished user input, so emitting warnings in the browser would leak
  draft text into the user's console and any client telemetry pipeline,
  and would repeat on each keystroke. The log message never includes a
  content excerpt for the same reason.

  Threshold and per-environment behaviour are configurable via the new
  `setSlowRenderThresholdMs(ms)` export: call with `500` from a
  browser-only init to opt browser bundles in, or with `0` to disable
  everywhere.

### Patch Changes

- Warn on slow markdown renders in @ecency/render-helper (#783)

## 2.4.35

### Patch Changes

- Fix ReDoS in render-helper that hung SSR for >30s (#782)

- [#782](https://github.com/ecency/vision-next/pull/782) [`5d39b3e`](https://github.com/ecency/vision-next/commit/5d39b3e4d40b8a9895ca87608a922694a4f0c377) Thanks [@feruzm](https://github.com/feruzm)! - Replace the regex inside `removeDuplicateAttributes` with a linear-time
  tokenizer. The previous pattern had catastrophic backtracking on inputs
  like `<div style=background-color:yellow;">` (unquoted attribute value
  followed by a stray quote), pinning the V8 regex engine for tens of
  seconds on real post bodies and tripping the SSR event-loop watchdog.

  Also drop a redundant `md.render(input)` call from the DOMParser
  fallback path in `markdown-to-html.method.ts` — the markdown output
  from the primary path is already available and re-rendering it cost
  ~100 ms per fallback hit on larger bodies.

## 2.4.34

### Patch Changes

- Feeds Performance improvements (#780)

## 2.4.32

### Patch Changes

- Render helper improvements (#756)

## 2.4.31

### Patch Changes

- LCP image src set (#755)

## 2.4.30

### Patch Changes

- Dom parser improvement (#753)

## 2.4.29

### Patch Changes

- Improve PWA (#752)

## 2.4.28

### Patch Changes

- Performance improvements, bundle optimization (#734)

## 2.4.26

### Patch Changes

- Thumbnail Waves and hivesigner fix (#728)

## 2.4.25

### Patch Changes

- Notification and iframe (#719)

## 2.4.24

### Patch Changes

- Fix odysee embeds (#710)

## 2.4.23

### Patch Changes

- Fix wrapping on render helper (#699)

## 2.4.22

### Patch Changes

- Render helper proxy fix (#698)

## 2.4.21

### Patch Changes

- Audio embeds (#687)

## 2.4.20

### Patch Changes

- Fix render-helper traverse (#686)

## 2.4.19

### Patch Changes

- Robust DOM traversal (#685)

## 2.4.18

### Patch Changes

- Fix speak (#661)

## 2.4.17

### Patch Changes

- Test and edge case fixes (#659)

## 2.4.16

### Patch Changes

- Improve webp, 3speak render-helper (#658)

## 2.4.15

### Patch Changes

- SEO context for Quality (#646)

## 2.4.14

### Patch Changes

- Render helper update (#643)
