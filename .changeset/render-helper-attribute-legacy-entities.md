---
"@ecency/render-helper": patch
---

Raw-HTML attribute values keep bare legacy entity names on the main render path: a Twitch embed's `?video=1&times=1` no longer becomes `?video=1×=1`, and the same holds for `&copy=`, `&reg=`, `&notin=`, `&lt=`, `&nbsp=` and the like in `src` and `href` (#2085). Values are decoded the way a browser decodes an attribute before the parser sees them. Image proxy URLs are unchanged for ordinary query strings; one carrying a numeric reference outside Unicode (`&#x110000;`, a lone surrogate) or a C1 reference (`&#x80;`) now gets the same proxy URL from the rendered body as from `catchPostImage`, where the two used to differ. A body of unterminated tags (`<a b ` repeated with no `>`) also renders in linear time instead of quadratic.
