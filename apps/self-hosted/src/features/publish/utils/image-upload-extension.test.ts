// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { describe, expect, it, vi } from 'vitest';
import { STARTER_KIT_EXTENSION } from './editor-extensions';
import { ImageUpload, imageUploadState, pendingImageUploads } from './image-upload-extension';
import { ImageUploadAuthError } from './image-upload';

// #1462: the editor takes images from the toolbar picker, a drop or a paste,
// uploads each one and inserts it where it was put.

function makeEditor(upload: (file: File) => Promise<string>) {
  return new Editor({
    extensions: [STARTER_KIT_EXTENSION, Image.configure({ inline: true }), ImageUpload.configure({ upload })],
    content: '<p>Hello</p>',
  });
}

const png = (name = 'a.png') => new File(['x'], name, { type: 'image/png' });
const flush = () => new Promise((r) => setTimeout(r, 0));

function plugin(editor: Editor) {
  const found = editor.state.plugins.find((p) => (p as unknown as { key: string }).key.startsWith('imageUpload'));
  if (!found) throw new Error('imageUpload plugin missing');
  return found.props as {
    handleDrop: (view: unknown, event: unknown) => boolean;
    handlePaste: (view: unknown, event: unknown) => boolean;
  };
}

describe('ImageUpload', () => {
  it('uploads picked files and inserts each image', async () => {
    const editor = makeEditor(async (file) => `https://images.ecency.com/u/${file.name}`);
    editor.commands.uploadImages([png('a.png'), png('b.png')]);
    expect(imageUploadState(editor).pending).toBe(2);
    await flush();
    await flush();
    const html = editor.getHTML();
    expect(html).toContain('src="https://images.ecency.com/u/a.png"');
    expect(html).toContain('src="https://images.ecency.com/u/b.png"');
    expect(imageUploadState(editor)).toEqual({ pending: 0, error: null });
    editor.destroy();
  });

  it('keeps the other images when one upload fails, and says which', async () => {
    const editor = makeEditor(async (file) => {
      if (file.name === 'bad.png') throw new Error('Request failed with status 500');
      return `https://images.ecency.com/u/${file.name}`;
    });
    editor.commands.uploadImages([png('bad.png'), png('good.png')]);
    await flush();
    await flush();
    expect(editor.getHTML()).toContain('good.png');
    expect(imageUploadState(editor).error).toMatch(/bad\.png/);
    editor.destroy();
  });

  it('takes image files from a drop and leaves other drops to the editor', async () => {
    const upload = vi.fn(async (file: File) => `https://images.ecency.com/u/${file.name}`);
    const editor = makeEditor(upload);
    const { handleDrop } = plugin(editor);
    const event = (files: File[]) => ({
      dataTransfer: { files },
      clientX: 0,
      clientY: 0,
      preventDefault: vi.fn(),
    });

    const text = event([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(handleDrop(editor.view, text)).toBe(false);
    expect(text.preventDefault).not.toHaveBeenCalled();

    const image = event([png('dropped.png')]);
    expect(handleDrop(editor.view, image)).toBe(true);
    expect(image.preventDefault).toHaveBeenCalled();
    await flush();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(editor.getHTML()).toContain('dropped.png');
    editor.destroy();
  });

  it('takes a pasted image file, and leaves pasted text alone', async () => {
    const upload = vi.fn(async (file: File) => `https://images.ecency.com/u/${file.name}`);
    const editor = makeEditor(upload);
    const { handlePaste } = plugin(editor);
    expect(handlePaste(editor.view, { clipboardData: { files: [] }, preventDefault: vi.fn() })).toBe(false);
    expect(handlePaste(editor.view, { clipboardData: { files: [png('pasted.png')] }, preventDefault: vi.fn() })).toBe(true);
    await flush();
    expect(editor.getHTML()).toContain('pasted.png');
    editor.destroy();
  });

  it('leaves a rich paste alone even when the clipboard also carries a picture of it', async () => {
    // Excel, Word and PowerPoint put text/html, text/plain AND a PNG rendering
    // on the clipboard. The content is the text.
    const upload = vi.fn(async () => 'https://images.ecency.com/u/x.png');
    const editor = makeEditor(upload);
    const { handlePaste } = plugin(editor);
    const clipboard = (text: string, html: string) => ({
      clipboardData: {
        files: [png('image.png')],
        getData: (type: string) => (type === 'text/plain' ? text : type === 'text/html' ? html : ''),
      },
      preventDefault: vi.fn(),
    });
    expect(handlePaste(editor.view, clipboard('1\t2', '<table><tr><td>1</td><td>2</td></tr></table>'))).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    // "Copy image" from a page: HTML holding the image, no text. Upload it.
    expect(handlePaste(editor.view, clipboard('', '<meta charset="utf-8"><img src="https://x.test/a.png">'))).toBe(true);
    editor.destroy();
  });

  it('keeps a copied column of links as a table, though its text is only URLs', () => {
    const upload = vi.fn(async () => 'https://images.ecency.com/u/x.png');
    const editor = makeEditor(upload);
    const { handlePaste } = plugin(editor);
    const clipboard = (text: string, html: string) => ({
      clipboardData: {
        files: [png('image.png')],
        getData: (type: string) => (type === 'text/plain' ? text : type === 'text/html' ? html : ''),
      },
      preventDefault: vi.fn(),
    });
    const urls = 'https://a.test/1\nhttps://a.test/2';
    expect(handlePaste(editor.view, clipboard(urls, '<TABLE><tr><td>https://a.test/1</td></tr></TABLE>'))).toBe(false);
    // A single link copied from a document is text with a link in it.
    expect(handlePaste(editor.view, clipboard('https://a.test/1', '<p><a href="https://a.test/1">https://a.test/1</a></p>'))).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    // Safari's Copy Image: the URL as text and the image as HTML. Upload it.
    expect(handlePaste(editor.view, clipboard('https://x.test/a.png', '<img src="https://x.test/a.png">'))).toBe(true);
    // A copied chart or picture with no text: the image, whatever HTML wraps it.
    expect(handlePaste(editor.view, clipboard('', '<table><tr><td><img src="x.png"></td></tr></table>'))).toBe(true);
    editor.destroy();
  });

  it('uploads when the text only names the image, and keeps real text', () => {
    const editor = makeEditor(vi.fn(async () => 'https://images.ecency.com/u/x.png'));
    const { handlePaste } = plugin(editor);
    const paste = (text: string, files = [png('photo.png')]) =>
      handlePaste(editor.view, {
        clipboardData: { files, getData: (type: string) => (type === 'text/plain' ? text : '') },
        preventDefault: vi.fn(),
      });
    // Finder and Linux file managers put the file name(s) or path(s) in the text.
    expect(paste('photo.png')).toBe(true);
    expect(paste('/home/me/Pictures/photo.png')).toBe(true);
    expect(paste('a.png\nb.png', [png('a.png'), png('b.png')])).toBe(true);
    // Finder joins several names with a carriage return.
    expect(paste('a.png\rb.png', [png('a.png'), png('b.png')])).toBe(true);
    // A non-image copied alongside is named too: still only names.
    expect(paste('a.png\rnotes.pdf', [png('a.png'), new File(['x'], 'notes.pdf', { type: 'application/pdf' })])).toBe(true);
    // macOS may hand the name over decomposed (NFD).
    expect(paste('cafe\u0301.png', [png('caf\u00e9.png')])).toBe(true);
    // Safari "Copy Image" carries the image URL.
    expect(paste('https://example.com/img/photo.png')).toBe(true);
    expect(paste('   \n ')).toBe(true);
    // Office: the text is the content.
    expect(paste('Revenue\t2026\nQ1\t10')).toBe(false);
    expect(paste('A paragraph from Word')).toBe(false);
    editor.destroy();
  });

  it('inserts several dropped images in order, even into an empty document', async () => {
    const editor = makeEditor(async (file) => `https://images.ecency.com/u/${file.name}`);
    editor.commands.setContent('');
    editor.commands.uploadImages([png('1.png'), png('2.png'), png('3.png')], 0);
    for (let i = 0; i < 4; i++) await flush();
    const html = editor.getHTML();
    expect(html.indexOf('1.png')).toBeLessThan(html.indexOf('2.png'));
    expect(html.indexOf('2.png')).toBeLessThan(html.indexOf('3.png'));
    editor.destroy();
  });

  it('keeps the drop point when the post is edited during the upload', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const editor = makeEditor(async (file) => {
      await gate;
      return `https://images.ecency.com/u/${file.name}`;
    });
    editor.commands.setContent('<p>first</p><p>second</p>');
    // The start of "second".
    const at = editor.state.doc.child(0).nodeSize + 1;
    editor.commands.uploadImages([png('here.png')], at);
    // Text typed above the drop point while the upload runs.
    editor.commands.insertContentAt(1, 'typed ');
    release();
    await flush();
    await flush();
    const second = editor.state.doc.child(1);
    expect(second.textContent).toBe('second');
    expect(second.firstChild?.type.name).toBe('image');
    editor.destroy();
  });

  it('says an uploaded image could not be placed, with its address, instead of losing it', async () => {
    const editor = makeEditor(async () => 'https://images.ecency.com/u/lost.png');
    editor.commands.setContent('<p>short</p>');
    editor.commands.uploadImages([png('lost.png')], 9999);
    await flush();
    await flush();
    const { error } = imageUploadState(editor);
    // Either it landed at the end, or the message names the uploaded address.
    if (!editor.getHTML().includes('lost.png')) {
      expect(error).toContain('https://images.ecency.com/u/lost.png');
    }
    expect(error ?? '').not.toMatch(/could not upload/i);
    editor.destroy();
  });

  it('ignores drops and pastes while the editor is read-only', () => {
    const upload = vi.fn(async () => 'u');
    const editor = makeEditor(upload);
    editor.setEditable(false);
    const { handleDrop, handlePaste } = plugin(editor);
    expect(handleDrop(editor.view, { dataTransfer: { files: [png()] }, preventDefault: vi.fn() })).toBe(false);
    expect(handlePaste(editor.view, { clipboardData: { files: [png()], getData: () => '' }, preventDefault: vi.fn() })).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('starts nothing when only asked whether it could', () => {
    const upload = vi.fn(async () => 'u');
    const editor = makeEditor(upload);
    expect(editor.can().uploadImages([png()])).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(imageUploadState(editor).pending).toBe(0);
    editor.destroy();
  });

  it('stops uploading the rest once the editor is gone', async () => {
    const upload = vi.fn(async (file: File) => `https://images.ecency.com/u/${file.name}`);
    const editor = makeEditor(upload);
    editor.commands.uploadImages([png('1.png'), png('2.png'), png('3.png')]);
    editor.destroy();
    for (let i = 0; i < 4; i++) await flush();
    expect(upload.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('puts a picked image where the cursor was when it was picked', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const editor = makeEditor(async (file) => {
      await gate;
      return `https://images.ecency.com/u/${file.name}`;
    });
    editor.commands.setContent('<p>first</p><p>second</p>');
    // Cursor at the start of "second", then the toolbar picker.
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 1);
    editor.commands.uploadImages([png('picked.png')]);
    // The author moves on and types in the first paragraph meanwhile.
    editor.commands.setTextSelection(1);
    editor.commands.insertContent('typed ');
    release();
    await flush();
    await flush();
    expect(editor.state.doc.child(1).firstChild?.type.name).toBe('image');
    expect(editor.state.doc.child(0).textContent).toBe('typed first');
    // The caret stays where the author is typing, not after the image.
    expect(editor.state.selection.$from.parent).toBe(editor.state.doc.child(0));
    editor.destroy();
  });

  it('keeps one upload\'s failure when another finishes after it', async () => {
    let releaseGood!: () => void;
    const slow = new Promise<void>((r) => (releaseGood = r));
    const editor = makeEditor(async (file) => {
      if (file.name === 'bad.png') throw new Error('status 500');
      await slow;
      return `https://images.ecency.com/u/${file.name}`;
    });
    editor.commands.uploadImages([png('good.png')]);
    editor.commands.uploadImages([png('bad.png')]);
    await flush();
    expect(imageUploadState(editor).error).toMatch(/bad\.png/);
    releaseGood();
    await flush();
    await flush();
    expect(imageUploadState(editor).error).toMatch(/bad\.png/);
    editor.destroy();
  });

  it('counts pending uploads across editors, so publishing can wait for them', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const editor = makeEditor(async () => {
      await gate;
      return 'https://images.ecency.com/u/x.png';
    });
    expect(pendingImageUploads()).toBe(0);
    editor.commands.uploadImages([png('a.png'), png('b.png')]);
    expect(pendingImageUploads()).toBe(2);
    release();
    for (let i = 0; i < 4; i++) await flush();
    expect(pendingImageUploads()).toBe(0);
    editor.destroy();
  });

  it('stops counting a closed editor\'s uploads at once, so another editor can publish', async () => {
    const never = new Promise<string>(() => {});
    const editor = makeEditor(() => never); // e.g. a wallet prompt nobody answers
    editor.commands.uploadImages([png('a.png'), png('b.png')]);
    expect(pendingImageUploads()).toBe(2);
    editor.destroy();
    expect(pendingImageUploads()).toBe(0);
  });

  it('stops the batch at a refused or cancelled signature, so the wallet asks once', async () => {
    const upload = vi.fn(async () => {
      throw new ImageUploadAuthError('Signing was cancelled in Keychain.');
    });
    const editor = makeEditor(upload);
    editor.commands.uploadImages([png('a.png'), png('b.png'), png('c.png')]);
    const seen: number[] = [];
    editor.on('transaction', () => seen.push(imageUploadState(editor).pending));
    for (let i = 0; i < 4; i++) await flush();
    expect(upload).toHaveBeenCalledTimes(1);
    // The toolbar is told the batch is over, not left showing "uploading".
    expect(seen[seen.length - 1]).toBe(0);
    const { pending, error } = imageUploadState(editor);
    expect(pending).toBe(0);
    expect(pendingImageUploads()).toBe(0);
    // One message naming every file left out, not the same one three times.
    expect(error?.match(/cancelled/g)).toHaveLength(1);
    expect(error).toMatch(/a\.png.*b\.png.*c\.png/);
    editor.destroy();
  });

  it('releases the whole batch when something throws midway', async () => {
    const editor = makeEditor(async (file) => `https://images.ecency.com/u/${file.name}`);
    editor.commands.uploadImages([png('a.png'), png('b.png')]);
    // A misbehaving listener, from here on: every later transaction throws.
    editor.on('transaction', () => {
      throw new Error('listener bug');
    });
    for (let i = 0; i < 6; i++) await flush().catch(() => {});
    expect(pendingImageUploads()).toBe(0);
    editor.destroy();
  });
});
