---
"@ecency/render-helper": patch
---

Long hashtag and mention chains render in linear time. A run of adjacent tags (`#a#b#c`) or mentions (`@alice@bob`) is now linked in one pass instead of one nested level per item, and mention placeholders are restored in a single scan. Output is unchanged for bodies without such runs; inside a run the links are the same, without the extra nested `<span>` wrappers. Nesting deeper than 500 levels now takes the sanitize-only fallback straight away instead of running down to the engine's stack limit.
