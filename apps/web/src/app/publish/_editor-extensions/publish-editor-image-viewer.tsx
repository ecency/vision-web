import { useUploadImageMutation } from "@/api/sdk-mutations";
import { extForImageType } from "@/utils";
import { Button, Popover, PopoverContent } from "@/features/ui";
import { proxifyImageSrc } from "@ecency/render-helper";
import i18next from "i18next";
import Paragraph from "@tiptap/extension-paragraph";
import { Placeholder } from "@tiptap/extensions";
import Text from "@tiptap/extension-text";
import { EditorContent, Node, NodeViewProps, NodeViewWrapper, useEditor } from "@tiptap/react";
import { UilSpinner, UilTrash } from "@tooni/iconscout-unicons-react";
import clsx from "clsx";
import Image from "next/image";
import { useEffect } from "react";
const processedBlobUrls = new Set<string>();

export function PublishEditorImageViewer({
  node: {
    attrs: { src, alt, class: alignClass }
  },
  updateAttributes,
  deleteNode,
  selected
}: NodeViewProps) {
  const captionEditor = useEditor({
    shouldRerenderOnTransaction: true,
    content: alt ?? "",
    extensions: [
      Node.create({
        name: "oneLine",
        topNode: true,
        content: "block"
      }),
      Paragraph,
      Placeholder.configure({
        placeholder: ({ node }) => {
          return "Caption";
        }
      }),
      Text
    ],
    onUpdate({ editor }) {
      const text = editor.getText();
      updateAttributes({
        alt: text
      });
    }
  });

  const { mutateAsync: uploadImage } = useUploadImageMutation();
  const isBlob = typeof src === "string" && src.startsWith("blob");
  const isEcencyImage = (() => {
    if (typeof src !== "string") return false;
    try {
      return ["i.ecency.com", "images.ecency.com"].includes(new URL(src).hostname);
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (isBlob && !processedBlobUrls.has(src)) {
      processedBlobUrls.add(src);
      (async () => {
        try {
          const response = await fetch(src);
          const blob = await response.blob();
          // Pasted images carry no name; `alt` is the caption (often empty), so
          // deriving the filename from it produced an extension-less upload that
          // the image server rejects with 400. Always build a valid name+ext.
          const file = new File([blob], `pasted-image-${Date.now()}.${extForImageType(blob.type)}`, {
            type: blob.type
          });
          const { url } = await uploadImage({ file });
          updateAttributes({ src: url });
        } catch {
          /* handled in mutation */
        }
      })();
    }
  }, [isBlob, src, uploadImage, updateAttributes]);

  return (
    <NodeViewWrapper
      onClick={() => captionEditor?.chain().selectTextblockEnd().focus().run()}
      className={clsx(
        "publish-editor-image-viewer cursor-grab border hover:border-blue-dark-sky inline-flex relative",
        selected ? "border-blue-dark-sky" : "border-transparent",
        alignClass === "pull-left" && "float-left mr-2",
        alignClass === "pull-right" && "float-right ml-2"
      )}
      data-drag-handle
    >
      <Popover
        className="inline-flex"
        directContent={
          <div
            className={clsx("inline-flex flex-col items-center", isBlob && "animate-fade-in-up")}
          >
            <div
              className={clsx(
                "absolute top-0 left-0 w-full h-full items-center justify-center",
                  isBlob ? "flex" : "hidden"
              )}
            >
              <UilSpinner className="size-12 text-white animate-spin" />
            </div>
            <Image
              className={clsx("w-auto max-w-full", isBlob && "grayscale blur-sm")}
              src={src}
              width={200}
              height={200}
              alt={alt}
            />
            <div className="flex items-center justify-center text-sm font-sans text-center leading-relaxed py-4">
              <EditorContent editor={captionEditor} className="cursor-text" />
            </div>
          </div>
        }
        behavior="hover"
      >
        <PopoverContent>
          <div className="flex gap-2">
            {isEcencyImage && (
              <Button
                noPadding={true}
                size="xs"
                appearance="gray-link"
                className="!h-auto"
                onClick={() =>
                  updateAttributes({
                    src: proxifyImageSrc(src, 200, 200, "match")
                  })
                }
              >
                Small
              </Button>
            )}
            {isEcencyImage && (
              <Button
                noPadding={true}
                size="xs"
                appearance="gray-link"
                className="!h-auto"
                onClick={() =>
                  updateAttributes({
                    src: proxifyImageSrc(src, 400, 400, "match")
                  })
                }
              >
                Medium
              </Button>
            )}
            {isEcencyImage && (
              <Button
                noPadding={true}
                size="xs"
                appearance="gray-link"
                className="!h-auto"
                onClick={() =>
                  updateAttributes({
                    src: proxifyImageSrc(src, 0, 0, "match")
                  })
                }
              >
                Original
              </Button>
            )}
            <div className="h-[36px] -my-2 w-[1px] bg-[--border-color]" />
            <Button
              noPadding={true}
              className="!h-auto"
              icon={<UilTrash />}
              size="xs"
              appearance="gray-link"
              onClick={deleteNode}
              aria-label={i18next.t("g.delete", { defaultValue: "Delete" })}
            />
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}
