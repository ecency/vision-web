---
"@ecency/render-helper": patch
---

Raw-HTML attribute values keep bare legacy entity names on the main render path: a Twitch embed's `?video=1&times=1` no longer becomes `?video=1×=1`, and the same holds for `&copy=`, `&reg=`, `&notin=`, `&lt=`, `&nbsp=` and the like in `src` and `href` (#2085). Values are decoded the way a browser decodes an attribute before the parser sees them; image proxy URLs are unchanged.
