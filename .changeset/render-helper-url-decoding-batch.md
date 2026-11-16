---
"@ecency/render-helper": patch
---

Body image URLs are proxied as the URL the post names, decoded exactly once (#2092). A markdown image or link destination now has its complete references decoded once, as CommonMark does (`![](?a=1&amp;b=2)` names `?a=1&b=2`; `&copy` without `;` stays as written), the image path no longer decodes a second time (`<img src="?x=1&amp;times=2">` stays `?x=1&times=2`, a bare `&timestamp=2` is kept as written), and the LCP preload's body scan decodes the same way, so it keeps matching the rendered image. A markdown link with `&amp;` in its destination now points where it says. The app render keeps a URL with balanced parentheses whole (`photo_(1).png`).

Also: an image URL in text keeps the text after it (#2094); a refused iframe's `(Unsupported ...)` placeholder is no longer linkified (#2095); the app render leaves entities in code spans and fenced blocks as written instead of showing placeholder digits (#2093). A fenced code block over 20 KB is shown as plain code instead of being syntax highlighted, which took seconds on large blocks (#2097), and highlighted code is escaped, so markup inside a string literal (`"<i>hi</i>"`) is shown rather than rendered. `SECTION_LIST` now also reserves `insights` and `notifications`, so `/@user/notifications` is a profile section, not a post link.
