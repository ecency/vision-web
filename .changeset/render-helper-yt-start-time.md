---
"@ecency/render-helper": patch
---

`extractYtStartTime` reads YouTube's hour, minute and second form in `t` (`1m30s` is 90, `1h2m3s` is 3723) instead of keeping only the first number, so the parsed start time (`data-start-time` on YouTube video links, used for the video link caption on web and by mobile) is right for those forms. A value that is not a time (negative, non-numeric, empty, or above 9999999 seconds) gives no start time instead of `NaN`, a negative number, `0` or a huge number, and an invalid `t` falls back to a valid `start`.
