import { KeyboardEvent } from "react";
import { handleEditorShortcut } from "@/features/shared/editor-toolbar/shortcuts";

export function handleShortcuts(e: KeyboardEvent<HTMLDivElement>) {
  handleEditorShortcut(e);
}
