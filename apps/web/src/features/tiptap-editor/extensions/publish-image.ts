import Image from "@tiptap/extension-image";

/**
 * Image as the publish editor uses it. TipTap 3 added width and height
 * attributes to Image. They are dropped so the node keeps its TipTap 2 shape:
 * the size buttons change the src, not these attributes, and an aligned image
 * would otherwise carry them into the stored body.
 */
export const PublishImage = Image.configure({ inline: true }).extend({
  addAttributes() {
    const { width: _width, height: _height, ...attributes } = (this.parent?.() ?? {}) as Record<
      string,
      unknown
    >;
    return attributes;
  }
});
