---
"@ecency/render-helper": patch
---

The app render (`forApp`) no longer swaps entities for placeholders inside URLs (#2092). An image URL carrying `&amp;` was proxied with the placeholder in it, so the app loaded a different URL than the post names, and an embed URL could have its query appended a second time (a SoundCloud player). URLs now render exactly as on the web; entities in text are still kept as written.
