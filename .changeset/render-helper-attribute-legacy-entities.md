---
"@ecency/render-helper": patch
---

Raw-HTML attribute values keep bare legacy entity names on the main render path: a Twitch embed's `?video=1&times=1` no longer becomes `?video=1×=1`, and the same holds for `&copy=`, `&reg=`, `&notin=`, `&lt=`, `&nbsp=` and the like in `src` and `href` (#2085). Values are decoded the way a browser decodes an attribute before the parser sees them: a literal tab or newline is a space, as before, and one written as a reference (`&#10;`) is kept. Image proxy URLs are unchanged for ordinary query strings; one carrying a numeric reference outside Unicode (`&#x110000;`, a lone surrogate) or a C1 reference (`&#x80;`) now gets the same proxy URL from the rendered body as from `catchPostImage`, where the two used to differ.

Attribute preprocessing is now linear on bodies of tags that never close (`<a b ` repeated, with or without a `>` hidden in a quoted value after them), which took seconds per 100 KB before.
