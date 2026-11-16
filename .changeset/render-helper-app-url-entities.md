---
"@ecency/render-helper": patch
---

The app render (`forApp`) no longer swaps entities for placeholders inside URLs (#2092). An image URL carrying `&amp;` was proxied with the placeholder in it, so the app loaded a different URL than the post names, and an embed URL could have its query appended a second time (a SoundCloud player). A URL up to its first space, quote, angle bracket or `)` now renders as on the web; an entity in the part of a URL after a `)`, a quote or a space is still swapped as before. An entity written directly after a bare URL (`https://e.com/p&copy;`) is now read as part of the URL, as the web render already did. The placeholder swap and restore are now single passes, linear on bodies with many distinct references.
