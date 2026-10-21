// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { LINK_EXTENSION, STARTER_KIT_EXTENSION } from './editor-extensions';

// TipTap 3 added link, underline, listKeymap and trailingNode to StarterKit.
// Both editors keep their TipTap 2 schema and output.
function withEditor(run: (editor: Editor) => void) {
  const editor = new Editor({
    extensions: [STARTER_KIT_EXTENSION, LINK_EXTENSION],
    content: '<p></p>',
  });
  try {
    run(editor);
  } finally {
    editor.destroy();
  }
}

describe('STARTER_KIT_EXTENSION', () => {
  it('leaves LINK_EXTENSION as the only link extension', () => {
    withEditor((editor) => {
      const names = editor.extensionManager.extensions.map((extension) => extension.name);
      expect(names.filter((name) => name === 'link')).toHaveLength(1);
      expect(names).not.toContain('underline');
      expect(names).not.toContain('listKeymap');
      expect(editor.schema.marks.underline).toBeUndefined();
    });
  });

  it('does not append an empty paragraph after a trailing block', () => {
    withEditor((editor) => {
      editor.commands.setContent('<blockquote><p>quote</p></blockquote>', {
        emitUpdate: false,
      });
      expect(editor.getHTML()).toBe('<blockquote><p>quote</p></blockquote>');
    });
  });
});
