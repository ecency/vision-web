import { EcencyConfigManager } from "@/config";
import { FragmentsDialog } from "@/features/shared/fragments";
import { parseAllExtensionsToDoc, resolveInsertContent } from "@/features/tiptap-editor";
import { Editor } from "@tiptap/core";
import { simpleMarkdownToHTML } from "@ecency/render-helper";
import { PublishEditorHtmlWarning } from "./publish-editor-html-warning";
import { useCallback, useState } from "react";

interface Props {
  showFragments: boolean;
  setShowFragments: (v: boolean) => void;
  editor: Editor | null;
}

export function PublishEditorToolbarFragments({ showFragments, setShowFragments, editor }: Props) {
  const [showWarning, setShowWarning] = useState(false);

  const onPick = useCallback(
    (e: string) => {
      if (/<[a-z]+>.*<\/[a-z]+>/gim.test(e)) {
        setShowFragments(false);
        setShowWarning(true);
        return;
      }

      const content = editor
        ? resolveInsertContent(editor.schema, parseAllExtensionsToDoc(simpleMarkdownToHTML(e)), e)
        : null;

      if (content) {
        editor?.chain().focus().insertContent(content).run();
      }
      setShowFragments(false);
    },
    [editor, setShowFragments]
  );

  return (
    <EcencyConfigManager.Conditional
      condition={({ visionFeatures }) => visionFeatures.fragments.enabled}
    >
      <FragmentsDialog show={showFragments} setShow={setShowFragments} onPick={onPick} />

      <PublishEditorHtmlWarning show={showWarning} setShow={setShowWarning} />
    </EcencyConfigManager.Conditional>
  );
}
