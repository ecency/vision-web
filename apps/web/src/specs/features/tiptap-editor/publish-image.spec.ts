import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { PublishImage } from "@/features/tiptap-editor/extensions/publish-image";
import { PublishStarterKit } from "@/features/tiptap-editor/extensions/publish-starter-kit";

// TipTap 3 added width and height to Image; the publish editor keeps the v2 node.
describe("PublishImage", () => {
  it("does not carry width or height into the document", () => {
    const editor = new Editor({ extensions: [PublishStarterKit, PublishImage], content: "<p></p>" });
    try {
      editor.commands.setContent(
        '<p><img src="https://images.ecency.com/a.png" alt="a" width="300" height="200"></p>',
        { emitUpdate: false }
      );
      expect(editor.getHTML()).toBe('<p><img src="https://images.ecency.com/a.png" alt="a"></p>');
    } finally {
      editor.destroy();
    }
  });
});
