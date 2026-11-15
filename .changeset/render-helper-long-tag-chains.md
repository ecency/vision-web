---
"@ecency/render-helper": patch
---

Long hashtag and mention chains render in linear time. A run of adjacent tags and mentions (`#a#b#c`, `@alice@bob`, `#a@alice#b@bob`) is now linked in one pass instead of one nested level per item, and mention placeholders are restored in a single scan. Output is unchanged for bodies without such runs; inside a run the links are the same, without the extra nested `<span>` wrappers. Markup nested deeper than 2000 levels is reduced to its plain text from that depth down, so the rest of the body is still transformed and nothing below the cap ships untransformed.
