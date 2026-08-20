import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_OBSERVER } from '@/consts/observer';
import {
  prefetchGetPostsFeedQuery,
  getPostsFeedQueryData,
  usePostsFeedQuery,
} from '@/api/queries/get-account-posts-feed-query';
import {
  getAccountPostsInfiniteQueryOptions,
  getPostsRankedInfiniteQueryOptions,
} from '@ecency/sdk';
import { prefetchInfiniteQuery, getInfiniteQueryData } from '@/core/react-query';
import { appAxios } from '@/api/axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createTestQueryClient } from '@/specs/test-utils';
import React from 'react';

// Mock dependencies
vi.mock('@ecency/sdk', () => ({
  getAccountPostsInfiniteQueryOptions: vi.fn(),
  getPostsRankedInfiniteQueryOptions: vi.fn(),
}));

vi.mock('@/core/react-query', async () => {
  const actual = await vi.importActual('@/core/react-query');
  return {
    ...actual,
    prefetchInfiniteQuery: vi.fn(),
    getInfiniteQueryData: vi.fn(),
  };
});

vi.mock('@/api/axios', () => ({
  appAxios: {
    get: vi.fn(),
  },
}));

describe('get-account-posts-feed-query', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  describe('prefetchGetPostsFeedQuery', () => {
    describe('promoted section', () => {
      it('should fetch promoted entries when what is "promoted"', async () => {
        const mockData = [
          { author: 'alice', permlink: 'post1', title: 'Promoted Post 1' },
          { author: 'bob', permlink: 'post2', title: 'Promoted Post 2' },
        ];

        vi.mocked(appAxios.get).mockResolvedValue({ data: mockData });
        vi.mocked(prefetchInfiniteQuery).mockResolvedValue({
          pages: [mockData],
          pageParams: ['empty'],
        });

        const result = await prefetchGetPostsFeedQuery('promoted', '', 20);

        expect(prefetchInfiniteQuery).toHaveBeenCalled();
        expect(result).toBeDefined();
        expect(result?.pages).toHaveLength(1);
      });

      it('should use correct query key for promoted entries', async () => {
        vi.mocked(prefetchInfiniteQuery).mockResolvedValue({
          pages: [[]],
          pageParams: ['empty'],
        });

        await prefetchGetPostsFeedQuery('promoted', 'sometag', 20);

        const callArgs = vi.mocked(prefetchInfiniteQuery).mock.calls[0][0];
        expect(callArgs.queryKey).toContain('infinite');
      });
    });

    describe('account posts section', () => {
      it('should fetch account posts when tag starts with @', async () => {
        const mockOptions = {
          queryKey: ['posts', 'account', 'alice', 'blog'],
          queryFn: vi.fn(),
        };

        vi.mocked(getAccountPostsInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(prefetchInfiniteQuery).mockResolvedValue(undefined);

        await prefetchGetPostsFeedQuery('blog', '@alice', 20, 'observer');

        expect(getAccountPostsInfiniteQueryOptions).toHaveBeenCalledWith(
          'alice',
          'blog',
          20,
          'observer',
          true
        );
      });

      it('should handle URL-encoded @ symbol (%40)', async () => {
        const mockOptions = {
          queryKey: ['posts', 'account', 'bob', 'posts'],
          queryFn: vi.fn(),
        };

        vi.mocked(getAccountPostsInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(prefetchInfiniteQuery).mockResolvedValue(undefined);

        await prefetchGetPostsFeedQuery('posts', '%40bob', 20);

        expect(getAccountPostsInfiniteQueryOptions).toHaveBeenCalledWith(
          'bob',
          'posts',
          20,
          DEFAULT_OBSERVER,
          true
        );
      });

      it('should strip @ symbol from username', async () => {
        const mockOptions = {
          queryKey: ['posts', 'account', 'charlie'],
          queryFn: vi.fn(),
        };

        vi.mocked(getAccountPostsInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(prefetchInfiniteQuery).mockResolvedValue(undefined);

        await prefetchGetPostsFeedQuery('blog', '@charlie', 20);

        expect(getAccountPostsInfiniteQueryOptions).toHaveBeenCalledWith(
          'charlie',
          'blog',
          20,
          DEFAULT_OBSERVER,
          true
        );
      });
    });

    describe('feed section', () => {
      it('should use getPostsRankedInfiniteQueryOptions with resolvePosts:false for feed', async () => {
        const mockOptions = {
          queryKey: ['posts', 'ranked', 'feed'],
          queryFn: vi.fn(),
        };

        vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(prefetchInfiniteQuery).mockResolvedValue(undefined);

        await prefetchGetPostsFeedQuery('feed', 'tag1', 20, 'observer');

        expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith(
          'feed',
          'tag1',
          20,
          'observer',
          true,
          { resolvePosts: false }
        );
      });

      it('should handle feed without observer', async () => {
        const mockOptions = {
          queryKey: ['posts', 'ranked', 'feed'],
          queryFn: vi.fn(),
        };

        vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(prefetchInfiniteQuery).mockResolvedValue(undefined);

        await prefetchGetPostsFeedQuery('feed', 'tag1', 20);

        expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith(
          'feed',
          'tag1',
          20,
          DEFAULT_OBSERVER,
          true,
          { resolvePosts: false }
        );
      });
    });

    describe('other sections (trending, hot, created)', () => {
      it('should fetch trending posts', async () => {
        const mockOptions = {
          queryKey: ['posts', 'ranked', 'trending'],
          queryFn: vi.fn(),
        };

        vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(prefetchInfiniteQuery).mockResolvedValue(undefined);

        await prefetchGetPostsFeedQuery('trending', 'tag1', 20);

        expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith(
          'trending',
          'tag1',
          20,
          DEFAULT_OBSERVER
        );
      });

      it('should fetch hot posts', async () => {
        const mockOptions = {
          queryKey: ['posts', 'ranked', 'hot'],
          queryFn: vi.fn(),
        };

        vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(prefetchInfiniteQuery).mockResolvedValue(undefined);

        await prefetchGetPostsFeedQuery('hot', 'tag1', 20);

        expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith('hot', 'tag1', 20, DEFAULT_OBSERVER);
      });

      it('should fetch created posts', async () => {
        const mockOptions = {
          queryKey: ['posts', 'ranked', 'created'],
          queryFn: vi.fn(),
        };

        vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(prefetchInfiniteQuery).mockResolvedValue(undefined);

        await prefetchGetPostsFeedQuery('created', 'tag1', 20);

        expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith('created', 'tag1', 20, DEFAULT_OBSERVER);
      });

      it('should handle custom limit', async () => {
        const mockOptions = {
          queryKey: ['posts', 'ranked', 'trending'],
          queryFn: vi.fn(),
        };

        vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(prefetchInfiniteQuery).mockResolvedValue(undefined);

        await prefetchGetPostsFeedQuery('trending', 'tag1', 50);

        expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith('trending', 'tag1', 50, DEFAULT_OBSERVER);
      });
    });
  });

  describe('getPostsFeedQueryData', () => {
    describe('promoted section', () => {
      it('should get promoted entries data from cache', () => {
        const mockData = {
          pages: [[{ author: 'alice', permlink: 'post1' }]],
          pageParams: ['empty'],
        };

        vi.mocked(getInfiniteQueryData).mockReturnValue(mockData);

        const result = getPostsFeedQueryData('promoted', '', 20);

        expect(getInfiniteQueryData).toHaveBeenCalled();
        expect(result).toEqual(mockData);
      });
    });

    describe('account posts section', () => {
      it('should get account posts data when tag starts with @', () => {
        const mockOptions = {
          queryKey: ['posts', 'account', 'alice', 'blog'],
        };

        vi.mocked(getAccountPostsInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(getInfiniteQueryData).mockReturnValue(undefined);

        getPostsFeedQueryData('blog', '@alice', 20);

        expect(getAccountPostsInfiniteQueryOptions).toHaveBeenCalledWith(
          'alice',
          'blog',
          20,
          DEFAULT_OBSERVER,
          true
        );
      });

      it('should handle %40 encoded username', () => {
        const mockOptions = {
          queryKey: ['posts', 'account', 'bob'],
        };

        vi.mocked(getAccountPostsInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(getInfiniteQueryData).mockReturnValue(undefined);

        getPostsFeedQueryData('posts', '%40bob', 20, 'observer');

        expect(getAccountPostsInfiniteQueryOptions).toHaveBeenCalledWith(
          'bob',
          'posts',
          20,
          'observer',
          true
        );
      });
    });

    describe('feed section', () => {
      it('should get feed data with resolvePosts:false', () => {
        const mockOptions = {
          queryKey: ['posts', 'ranked', 'feed'],
        };

        vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(getInfiniteQueryData).mockReturnValue(undefined);

        getPostsFeedQueryData('feed', 'tag1', 20, 'observer');

        expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith(
          'feed',
          'tag1',
          20,
          'observer',
          true,
          { resolvePosts: false }
        );
      });
    });

    describe('other sections', () => {
      it('should get trending data', () => {
        const mockOptions = {
          queryKey: ['posts', 'ranked', 'trending'],
        };

        vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);
        vi.mocked(getInfiniteQueryData).mockReturnValue(undefined);

        getPostsFeedQueryData('trending', 'tag1', 20);

        expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith('trending', 'tag1', 20, DEFAULT_OBSERVER);
      });
    });
  });

  describe('usePostsFeedQuery', () => {
    it('should return query for promoted section', () => {
      const { result } = renderHook(() => usePostsFeedQuery('promoted', '', undefined, 20), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      });

      // Verify the hook returns a proper query result with expected properties
      expect(result.current).toBeDefined();
      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('fetchNextPage');
    });

    it('should handle account posts with @ symbol', () => {
      const mockOptions = {
        queryKey: ['posts', 'account', 'alice', 'blog'],
        queryFn: vi.fn(),
        initialPageParam: undefined,
        getNextPageParam: vi.fn(),
      };

      vi.mocked(getAccountPostsInfiniteQueryOptions).mockReturnValue(mockOptions as any);

      const { result } = renderHook(() => usePostsFeedQuery('blog', '@alice', 'observer', 20), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      });

      expect(getAccountPostsInfiniteQueryOptions).toHaveBeenCalledWith(
        'alice',
        'blog',
        20,
        'observer',
        true
      );
    });

    it('should handle feed section with resolvePosts:false', () => {
      const mockOptions = {
        queryKey: ['posts', 'ranked', 'feed'],
        queryFn: vi.fn(),
        initialPageParam: undefined,
        getNextPageParam: vi.fn(),
      };

      vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);

      const { result } = renderHook(() => usePostsFeedQuery('feed', 'tag1', 'observer', 20), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      });

      expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith(
        'feed',
        'tag1',
        20,
        'observer',
        true,
        { resolvePosts: false }
      );
    });

    it('should handle other sections without resolvePosts', () => {
      const mockOptions = {
        queryKey: ['posts', 'ranked', 'trending'],
        queryFn: vi.fn(),
        initialPageParam: undefined,
        getNextPageParam: vi.fn(),
      };

      vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);

      renderHook(() => usePostsFeedQuery('trending', 'tag1', undefined, 20), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      });

      // The hook, the server prefetch and the cache read now build these options
      // in one place, so this non-feed branch passes the same four arguments the
      // prefetch assertions above expect. The two it used to add were the SDK's
      // own defaults (enabled = true, no options object), so nothing changed
      // about the query itself.
      expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith(
        'trending',
        'tag1',
        20,
        DEFAULT_OBSERVER
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty tag', async () => {
      const mockOptions = {
        queryKey: ['posts', 'ranked', 'trending'],
        queryFn: vi.fn(),
      };

      vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);
      vi.mocked(prefetchInfiniteQuery).mockResolvedValue(undefined);

      await prefetchGetPostsFeedQuery('trending', '', 20);

      expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith('trending', '', 20, DEFAULT_OBSERVER);
    });

    it('should handle undefined observer', async () => {
      const mockOptions = {
        queryKey: ['posts', 'ranked', 'hot'],
        queryFn: vi.fn(),
      };

      vi.mocked(getPostsRankedInfiniteQueryOptions).mockReturnValue(mockOptions as any);
      vi.mocked(prefetchInfiniteQuery).mockResolvedValue(undefined);

      await prefetchGetPostsFeedQuery('hot', 'tag1', 20, undefined);

      expect(getPostsRankedInfiniteQueryOptions).toHaveBeenCalledWith('hot', 'tag1', 20, DEFAULT_OBSERVER);
    });

    it('should prioritize promoted over user posts when tag is @promoted', async () => {
      vi.mocked(appAxios.get).mockResolvedValue({ data: [] });
      vi.mocked(prefetchInfiniteQuery).mockResolvedValue({
        pages: [[]],
        pageParams: ['empty'],
      });

      await prefetchGetPostsFeedQuery('promoted', '@someone', 20);

      // Should call promoted query, not account posts
      expect(prefetchInfiniteQuery).toHaveBeenCalled();
      expect(getAccountPostsInfiniteQueryOptions).not.toHaveBeenCalled();
    });
  });
});
