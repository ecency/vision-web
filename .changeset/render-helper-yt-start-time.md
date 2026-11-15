---
"@ecency/render-helper": patch
---

`extractYtStartTime` reads YouTube's hour, minute and second form in `t` (`1m30s` is 90, `1h2m3s` is 3723) instead of keeping only the first number, so a shared link with a start time no longer starts the embed at the wrong second. A `t` or `start` value that is not a time (negative, non-numeric, empty) gives no start time instead of `NaN`, a negative number or `0`.
