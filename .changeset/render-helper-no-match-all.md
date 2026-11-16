---
"@ecency/render-helper": patch
---

`catchPostImage` and the HTML sanitizer no longer call `String.prototype.matchAll`, which is missing on Safari 12 and threw there (#1701). Output is unchanged.
