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

// Uploads in flight in any editor, so publishing can wait for them: a post
// submitted mid-upload would go out without those images.
let pendingTotal = 0;
const pendingListeners = new Set<() => void>();

function addPending(n: number): void {
  pendingTotal += n;
  for (const listener of pendingListeners) listener();
}

export function pendingImageUploads(): number {
  return pendingTotal;
}

export function subscribePendingImageUploads(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

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
 * after it, or null when it cannot go there or at the end of the post. The
 * author's caret stays where it is unless it was at the insertion point: an
 * upload finishing while they type elsewhere must not move it.
 */
function place(editor: Editor, src: string, file: File, at: number | undefined): number | null {
  const node = { type: 'image', attrs: { src, alt: file.name.replace(/\.[^.]+$/, '') } };
  const size = () => editor.state.doc.content.size;
  const before = editor.state.selection;
  for (const where of [Math.min(at ?? before.to, size()), size()]) {
    // The caret, carried through the insert so it can be put back.
    let from = before.from;
    let to = before.to;
    const follow = ({ transaction }: { transaction: { mapping: { map: (p: number, assoc?: number) => number } } }) => {
      from = transaction.mapping.map(from, -1);
      to = transaction.mapping.map(to, -1);
    };
    editor.on('transaction', follow);
    let inserted = false;
    try {
      // insertContentAt leaves the selection right after what it inserted,
      // including when an inline image had to be wrapped in a new paragraph.
      inserted = editor.chain().insertContentAt(where, node).run();
    } catch {
      // A position the schema cannot take: try the end of the post.
    } finally {
      editor.off('transaction', follow);
    }
    if (!inserted) continue;
    const after = editor.state.selection.to;
    const caretWasHere = before.empty && before.from === where;
    if (!caretWasHere) {
      try {
        editor.commands.setTextSelection({ from, to });
      } catch {
        // The old selection no longer fits the document: leave it after the image.
      }
    }
    return after;
  }
  return null;
}

async function run(editor: Editor, upload: ImageUploadOptions['upload'], files: File[], pos: number) {
  const storage = editor.storage.imageUpload;
  // Uploads of this batch still counted in the global pending total. Released
  // as each finishes, all at once when the editor closes (its results are
  // discarded, so they must not hold Publish in another editor), and whatever
  // is left if anything throws.
  let remaining = files.length;
  const release = (n: number) => {
    const count = Math.min(n, remaining);
    if (count <= 0) return;
    remaining -= count;
    addPending(-count);
  };
  const onDestroy = () => release(remaining);
  editor.on('destroy', onDestroy);
  // Keep the insertion point on the same spot while uploads run: every edit
  // made in the meantime (typing elsewhere, another image landing) moves it
  // with them, for a drop and for the cursor of a pick or paste alike.
  let at: number | undefined = pos;
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
      if (!editor.isDestroyed) storage.pending -= 1;
      release(1);
      // Add to the error rather than replace it: another upload running at the
      // same time may already have reported a failure.
      if (problems.length) {
        storage.error = [storage.error, ...problems.splice(0)].filter(Boolean).join('; ');
      }
      notify(editor);
    }
  } finally {
    // Whatever is left: the editor closed, or something above threw.
    if (!editor.isDestroyed) storage.pending -= remaining;
    release(remaining);
    editor.off('transaction', track);
    editor.off('destroy', onDestroy);
  }
}

/**
 * True when pasted HTML is nothing but images. Office apps put a PNG rendering
 * of a table or text on the clipboard next to its HTML; that paste is the HTML.
 */
function htmlIsOnlyImages(html: string): boolean {
  // Parsed, not pattern-matched: the HTML only decides whether to take the
  // paste, and a parser cannot be fooled by nested or odd markup.
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  return body.querySelector('img') !== null && (body.textContent ?? '').trim() === ''
    && body.querySelector('table, video, iframe, svg') === null;
}

function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter(isImageFile);
}

export const ImageUpload = Extension.create<ImageUploadOptions, ImageUploadState>({
  name: 'imageUpload',

  addOptions() {
    return {
      // uploadEditorImage puts a time limit on the request itself.
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
          const storage = editor.storage.imageUpload;
          // A new batch with nothing else running starts with a clean slate.
          if (storage.pending === 0) storage.error = null;
          storage.pending += images.length;
          addPending(images.length);
          run(editor as Editor, this.options.upload, images, pos ?? editor.state.selection.to).catch(() => {
            // Counts are released in run's finally; a throw here has nowhere to go.
          });
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
