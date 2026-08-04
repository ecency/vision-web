import type { Entry } from '@ecency/sdk';
import { describe, expect, it } from 'vitest';
import { selectTopLevelComments } from './top-level-comments';

const root = { author: 'alice', permlink: 'a-post' };

const entry = (over: Partial<Entry>): Entry => over as Entry;

const rootPost = entry({
  author: 'alice',
  permlink: 'a-post',
  parent_author: '',
  parent_permlink: 'hive-125125',
});

const reply = entry({
  author: 'bob',
  permlink: 're-a-post',
  parent_author: 'alice',
  parent_permlink: 'a-post',
});

const nested = entry({
  author: 'carol',
  permlink: 're-re-a-post',
  parent_author: 'bob',
  parent_permlink: 're-a-post',
});

describe('selectTopLevelComments', () => {
  it('does not count the post itself as a comment on itself', () => {
    // The reason this file exists. A post with no comments comes back from
    // bridge.get_discussion carrying one entry, the post, so a length check on
    // the response says every post has a discussion.
    expect(selectTopLevelComments(root, [rootPost])).toEqual([]);
  });

  it('takes the replies written on the post', () => {
    expect(selectTopLevelComments(root, [rootPost, reply])).toEqual([reply]);
  });

  it('leaves replies to replies out of the top level', () => {
    expect(selectTopLevelComments(root, [rootPost, reply, nested])).toEqual([
      reply,
    ]);
  });

  it('is empty for an empty response, without throwing', () => {
    expect(selectTopLevelComments(root, [])).toEqual([]);
  });

  it('ignores an entry parented on a different post', () => {
    const elsewhere = entry({
      author: 'dave',
      permlink: 're-other',
      parent_author: 'alice',
      parent_permlink: 'other-post',
    });
    expect(selectTopLevelComments(root, [rootPost, elsewhere])).toEqual([]);
  });
});
