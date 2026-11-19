# Self-hosted fonts

Unmodified copies of the Google Fonts files the site used through
`next/font/google`, committed so a build never depends on Google answering
(#2136). Same files, subsets and unicode ranges as Google's CSS; only the latin
subsets are preloaded.

| Family | Google version | Subsets | License |
| --- | --- | --- | --- |
| Inter (variable, 100 to 900) | v20 | cyrillic-ext, cyrillic, greek-ext, greek, vietnamese, latin-ext, latin | SIL Open Font License 1.1 |
| Lora (variable, declared 400 and 700) | v37 | cyrillic-ext, cyrillic, math, symbols, vietnamese, latin-ext, latin | SIL Open Font License 1.1 |
| Fredoka (variable, declared 500 and 600) | v17 | hebrew, latin-ext, latin | SIL Open Font License 1.1 |

`site.ts` (Inter, Lora) and `raidstead.ts` (Fredoka) declare one `localFont`
per subset with that subset's `unicode-range`; `stack.ts` joins them into one
font stack, latin first and the size-adjusted fallback last (see its comment
for why the order is the reverse of Google's CSS).

To update a family: fetch
`https://fonts.googleapis.com/css2?family=<Family>:wght@<weights>&display=swap`
with a current Chrome user agent, save each subset's woff2 as
`<family>/<subset>.woff2`, and copy its `unicode-range` into the module.
