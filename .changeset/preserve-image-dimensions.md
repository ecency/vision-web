---
"@ecency/render-helper": patch
---

Add `RenderOptions.preserveImageDimensions` so a consumer can keep author-supplied pixel width and height on body images. Browsers use that pair to reserve the box before the image loads. The default still strips both attributes.
