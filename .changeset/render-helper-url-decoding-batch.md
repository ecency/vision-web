---
"@ecency/render-helper": patch
---

Body image URLs are proxied as the URL the post names, decoded exactly once (#2092). A markdown image or link destination now has its entities decoded the way a browser reads an attribute (`![](?a=1&amp;b=2)` names `?a=1&b=2`), the image path no longer decodes a second time (`<img src="?x=1&amp;times=2">` stays `?x=1&times=2`, a bare `&timestamp=2` is kept as written), and the LCP preload's body scan decodes the same way, so it keeps matching the rendered image. A markdown link with `&amp;` in its destination now points where it says. The app render keeps a URL with balanced parentheses whole (`photo_(1).png`).

Also: an image URL in text keeps the text after it (#2094); a refused iframe's `(Unsupported ...)` placeholder is no longer linkified (#2095); the app render leaves entities in code spans and fenced blocks as written instead of showing placeholder digits (#2093).
