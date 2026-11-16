---
"@ecency/render-helper": patch
---

A link written as `/\example.com/...` (which a browser reads as `//example.com/...`) now gets the external-link policy (`rel="nofollow ugc noopener"`) even when it carries a mention or tag class, and in the sanitize-only fallback. A `<video poster>` is no longer entity-decoded twice before proxying (`?x=1&amp;times=2` stays `?x=1&times=2`).
