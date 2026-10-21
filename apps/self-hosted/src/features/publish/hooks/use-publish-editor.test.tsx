// @vitest-environment jsdom

import type { Editor } from '@tiptap/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TipTap 3 made setContent emit an update by default. This editor's onUpdate
// writes the draft, so loading a draft must not echo it back re-serialised.

const publishState = vi.hoisted(() => ({
  content: 'Hello **world**',
  setContentState: vi.fn(),
}));

vi.mock('./use-publish-state', () => ({
  usePublishState: () => publishState,
}));

import { usePublishEditor } from './use-publish-editor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let editor: Editor | null = null;

function Harness() {
  editor = usePublishEditor().editor;
  return null;
}

async function mountEditor() {
  await act(async () => {
    root.render(<Harness />);
  });
  await act(async () => {});
  if (!editor) throw new Error('editor was not created');
  return editor;
}

describe('usePublishEditor draft loading', () => {
  beforeEach(() => {
    publishState.content = 'Hello **world**';
    publishState.setContentState.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    editor = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('loads the draft without writing it back', async () => {
    const loaded = await mountEditor();

    expect(loaded.getText()).toBe('Hello world');
    expect(publishState.setContentState).not.toHaveBeenCalled();
  });

  it('still writes the draft when the user edits', async () => {
    const loaded = await mountEditor();

    act(() => {
      loaded.chain().focus('end').insertContent('!').run();
    });

    expect(publishState.setContentState).toHaveBeenCalledTimes(1);
    expect(publishState.setContentState.mock.calls[0][0]).toContain('world!');
  });
});
