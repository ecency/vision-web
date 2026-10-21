// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TipTap 3 made setContent emit an update by default. Loading the post into
// the editor must not run onUpdate, or an untouched post is re-serialised
// through turndown and saved with a body the author never wrote.

const updatePost = vi.hoisted(() => vi.fn(async (_input: { body: string }) => undefined));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@tooni/iconscout-unicons-react', () => ({ UilArrowLeft: () => null }));
vi.mock('../hooks/use-update-post', () => ({
  useUpdatePost: () => ({ mutateAsync: updatePost, isPending: false, error: null }),
}));
vi.mock('./publish-editor-toolbar', () => ({ PublishEditorToolbar: () => null }));
vi.mock('./publish-tags-selector', () => ({ PublishTagsSelector: () => null }));

import { t } from '@/core';
import { htmlToMarkdown, markdownToHtml } from '../utils/markdown';
import { EditPostEditor } from './edit-post-editor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Underscore emphasis comes back from turndown as asterisks, so a re-serialised
// body is visibly different from what the author stored.
const STORED_BODY = 'Some __bold__ and _italic_ text';

let root: Root;
let container: HTMLDivElement;

describe('EditPostEditor', () => {
  beforeEach(() => {
    updatePost.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('submits the stored body unchanged when the post was not edited', async () => {
    // Guard: without this the test could pass on a body that round-trips as is.
    expect(htmlToMarkdown(markdownToHtml(STORED_BODY))).not.toBe(STORED_BODY);

    await act(async () => {
      root.render(
        <EditPostEditor
          permlink="p"
          parentPermlink="blog"
          initialTitle="Title"
          initialBody={STORED_BODY}
          initialTags={['hive']}
        />,
      );
    });
    await act(async () => {});

    expect(container.querySelector('.ProseMirror')?.textContent).toBe(
      'Some bold and italic text',
    );

    const update = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === t('update'),
    );
    expect(update).toBeDefined();

    await act(async () => {
      update?.click();
    });

    expect(updatePost).toHaveBeenCalledTimes(1);
    expect(updatePost.mock.calls[0][0].body).toBe(STORED_BODY);
  });
});
