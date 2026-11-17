import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { authenticationStore } from '@/store';
import { isImageFile, uploadEditorImage } from './image-upload';

/**
 * Image upload for both editors (#1462): the toolbar's picker calls
 * `uploadImages`, and a drop or a paste of image files is taken here. Each file
 * is uploaded in turn and inserted where it was put. Progress and the last
 * error live in the extension's storage; the editor re-renders on the
 * transaction this dispatches, so the toolbar can show them.
 */

export interface ImageUploadOptions {
  /** Upload one file and resolve to its URL. Defaults to the session's upload. */
  upload: (file: File) => Promise<string>;
}

export interface ImageUploadState {
  pending: number;
  error: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageUpload: {
      /** Upload image files and insert them at `pos`, or at the selection. */
      uploadImages: (files: File[], pos?: number) => ReturnType;
    };
  }
  interface Storage {
    imageUpload: ImageUploadState;
  }
}

const KEY = new PluginKey('imageUpload');

export function imageUploadState(editor: Editor): ImageUploadState {
  const { pending, error } = editor.storage.imageUpload;
  return { pending, error };
}

/** Re-render subscribers (the toolbar) after a storage change. */
function notify(editor: Editor): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(KEY, true).setMeta('addToHistory', false));
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Insert one uploaded image at `at` (or the selection) and return the position
 * after it, or null when it cannot go there or at the end of the post.
 */
function place(editor: Editor, src: string, file: File, at: number | undefined): number | null {
  const node = { type: 'image', attrs: { src, alt: file.name.replace(/\.[^.]+$/, '') } };
  const size = () => editor.state.doc.content.size;
  for (const where of [Math.min(at ?? editor.state.selection.to, size()), size()]) {
    try {
      // insertContentAt leaves the selection right after what it inserted,
      // including when an inline image had to be wrapped in a new paragraph.
      if (editor.chain().insertContentAt(where, node).run()) return editor.state.selection.to;
    } catch {
      // A position the schema cannot take: try the end of the post.
    }
  }
  return null;
}

async function run(editor: Editor, upload: ImageUploadOptions['upload'], files: File[], pos?: number) {
  const storage = editor.storage.imageUpload;
  storage.error = null;
  // Keep the drop point on the same spot while uploads run: every edit made in
  // the meantime (typing above it, another image landing) moves it with them.
  let at = pos;
  const track = ({ transaction }: { transaction: { mapping: { map: (p: number) => number } } }) => {
    if (at !== undefined) at = transaction.mapping.map(at);
  };
  editor.on('transaction', track);
  const problems: string[] = [];
  try {
    for (const file of files) {
      // The post was closed: do not upload (or ask a wallet) for the rest.
      if (editor.isDestroyed) break;
      let src: string | null = null;
      try {
        src = await upload(file);
      } catch (e) {
        problems.push(`Could not upload ${file.name}: ${describe(e)}`);
      }
      if (src !== null && !editor.isDestroyed) {
        const after = place(editor, src, file, at);
        if (after === null) {
          problems.push(`Uploaded ${file.name} but could not place it in the post; its address is ${src}`);
        } else if (at !== undefined) {
          at = after;
        }
      }
      storage.pending -= 1;
      storage.error = problems.length ? problems.join('; ') : null;
      notify(editor);
    }
  } finally {
    editor.off('transaction', track);
  }
}

/**
 * True when pasted HTML is nothing but images. Office apps put a PNG rendering
 * of a table or text on the clipboard next to its HTML; that paste is the HTML.
 */
function htmlIsOnlyImages(html: string): boolean {
  const rest = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(?:meta|html|head|body|span|div|p|br)\b[^>]*>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .trim();
  return rest === '' && /<img\b/i.test(html);
}

function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter(isImageFile);
}

export const ImageUpload = Extension.create<ImageUploadOptions, ImageUploadState>({
  name: 'imageUpload',

  addOptions() {
    return {
      upload: (file: File) => uploadEditorImage(file, { user: authenticationStore.getState().user ?? null }),
    };
  },

  addStorage() {
    return { pending: 0, error: null };
  },

  addCommands() {
    return {
      uploadImages:
        (files, pos) =>
        ({ editor, dispatch }) => {
          const images = imageFiles(files);
          if (images.length === 0 || !editor.isEditable) return false;
          // editor.can() asks without dispatch: answer, start nothing.
          if (!dispatch) return true;
          editor.storage.imageUpload.pending += images.length;
          void run(editor as Editor, this.options.upload, images, pos);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: KEY,
        props: {
          handleDrop: (view: EditorView, event: DragEvent) => {
            if (!editor.isEditable) return false;
            const files = imageFiles(event.dataTransfer?.files);
            if (files.length === 0) return false;
            event.preventDefault();
            let pos: number | undefined;
            try {
              pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            } catch {
              // No layout to measure (a detached view): fall back to the selection.
            }
            return editor.commands.uploadImages(files, pos);
          },
          handlePaste: (_view: EditorView, event: ClipboardEvent) => {
            if (!editor.isEditable) return false;
            const files = imageFiles(event.clipboardData?.files);
            if (files.length === 0) return false;
            const html = event.clipboardData?.getData?.('text/html') ?? '';
            if (html && !htmlIsOnlyImages(html)) return false;
            event.preventDefault();
            return editor.commands.uploadImages(files);
          },
        },
      }),
    ];
  },
});
