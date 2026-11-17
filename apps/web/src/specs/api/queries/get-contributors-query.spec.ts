import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getContributorsQueryOptions } from '@/api/queries/get-contributors-query';
import { QueryIdentifiers } from '@/core/react-query';
import contributors from '@/consts/contributors.json';

// Mock remeda shuffle
vi.mock('remeda', () => ({
  shuffle: vi.fn((arr) => arr),
}));

describe('getContributorsQueryOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('query key', () => {
    it('should use CONTRIBUTORS query identifier', () => {
      const options = getContributorsQueryOptions();

      expect(options.queryKey).toEqual([QueryIdentifiers.CONTRIBUTORS]);
    });

    it('should have consistent query key', () => {
      const options1 = getContributorsQueryOptions();
      const options2 = getContributorsQueryOptions();

      expect(options1.queryKey).toEqual(options2.queryKey);
    });
  });

  describe('queryFn', () => {
    it('should return contributors array', () => {
      const options = getContributorsQueryOptions();
      const result = options.queryFn();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return shuffled contributors', async () => {  // Fixed: Made function async
      const { shuffle } = (await import('remeda' as any));
      shuffle.mockReturnValue([...contributors]);

      const options = getContributorsQueryOptions();
      options.queryFn();

      expect(shuffle).toHaveBeenCalledWith(contributors);
    });

    it('should contain contributor objects with expected properties', () => {
      const options = getContributorsQueryOptions();
      const result = options.queryFn();

      if (result.length > 0) {
        const contributor = result[0];
        expect(contributor).toHaveProperty('name');
      }
    });

    it('should be callable multiple times', () => {
      const options = getContributorsQueryOptions();

      const result1 = options.queryFn();
      const result2 = options.queryFn();

      expect(Array.isArray(result1)).toBe(true);
      expect(Array.isArray(result2)).toBe(true);
    });
  });

  describe('return structure', () => {
    it('should return query options object with required fields', () => {
      const options = getContributorsQueryOptions();

      expect(options).toHaveProperty('queryKey');
      expect(options).toHaveProperty('queryFn');
    });

    it('should have queryFn that is a function', () => {
      const options = getContributorsQueryOptions();

      expect(typeof options.queryFn).toBe('function');
    });

    it('should have queryKey that is an array', () => {
      const options = getContributorsQueryOptions();

      expect(Array.isArray(options.queryKey)).toBe(true);
    });
  });

  describe('contributors data', () => {
    it('should load contributors from JSON file', () => {
      expect(contributors).toBeDefined();
      expect(Array.isArray(contributors)).toBe(true);
    });

    it('should have non-empty contributors list', () => {
      expect(contributors.length).toBeGreaterThan(0);
    });

    it('should list each account once, with no padding in the name', () => {
      const names = contributors.map((c) => c.name);

      // A padded name links to a profile that does not exist, and a repeated one
      // renders twice under the same React key.
      expect(names.filter((n) => n !== n.trim())).toEqual([]);
      expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    });
  });
});
