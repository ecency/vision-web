---
"@ecency/sdk": patch
---

`SearchQuery` parses `author:`, `type:`, `category:` and `tag:` tokens with an exec loop instead of `String.prototype.matchAll`, which is missing on Safari 12 and threw there (#1701).
