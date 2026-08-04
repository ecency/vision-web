import { describe, expect, it } from 'vitest';
import { chooseFeedRetry, type FeedErrorFlags } from './feed-retry';

const flags = (over: Partial<FeedErrorFlags> = {}): FeedErrorFlags => ({
  isFetchNextPageError: false,
  isRefetchError: false,
  ...over,
});

describe('chooseFeedRetry', () => {
  it('fetches the next page when the next page is what failed', () => {
    expect(chooseFeedRetry(flags({ isFetchNextPageError: true }))).toBe(
      'next-page',
    );
  });

  it('refreshes when the refresh is what failed', () => {
    // The case a hasNextPage check gets wrong. There are more pages to come, so
    // that check would append one, clearing the error while the pages the
    // reader is looking at stay exactly as stale as they were.
    expect(chooseFeedRetry(flags({ isRefetchError: true }))).toBe('refresh');
  });

  it('refreshes when neither flag says which operation failed', () => {
    expect(chooseFeedRetry(flags())).toBe('refresh');
  });

  it('prefers the next page when query-core reports both', () => {
    // Both set means the newer failure is the one on screen at the bottom of
    // the feed, which is where the reader is and where the retry button is.
    expect(
      chooseFeedRetry(
        flags({ isFetchNextPageError: true, isRefetchError: true }),
      ),
    ).toBe('next-page');
  });

  it('never answers next-page off anything but a next-page failure', () => {
    for (const isFetchNextPageError of [false, true]) {
      for (const isRefetchError of [false, true]) {
        const answer = chooseFeedRetry({
          isFetchNextPageError,
          isRefetchError,
        });
        if (answer === 'next-page') {
          expect(isFetchNextPageError).toBe(true);
        }
      }
    }
  });
});
