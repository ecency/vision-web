import { describe, expect, it } from 'vitest';
import { stripHtmlAndMarkdown } from './strip-markdown';

describe('stripHtmlAndMarkdown', () => {
  it('drops image markup instead of reading the URL out', () => {
    const result = stripHtmlAndMarkdown(
      'Look at this ![a cat on a roof](https://images.example.com/cat.png) picture.',
    );
    expect(result).toBe('Look at this picture.');
    expect(result).not.toContain('https');
    expect(result).not.toContain('png');
  });

  it('keeps link text and drops the target', () => {
    const result = stripHtmlAndMarkdown(
      'Read [the announcement](https://example.com/blog/post-1) today.',
    );
    expect(result).toBe('Read the announcement today.');
    expect(result).not.toContain('example.com');
  });

  it('drops heading and emphasis markers', () => {
    expect(stripHtmlAndMarkdown('## Chapter one\nIt was **very** quiet.')).toBe(
      'Chapter one It was very quiet.',
    );
    expect(stripHtmlAndMarkdown('_soft_ and __loud__')).toBe('soft and loud');
  });

  it('drops blockquote markers, code fences and inline code', () => {
    expect(stripHtmlAndMarkdown('> quoted line')).toBe('quoted line');
    expect(stripHtmlAndMarkdown('before\n```\nconst x = 1;\n```\nafter')).toBe(
      'before after',
    );
    expect(stripHtmlAndMarkdown('run `npm test` now')).toBe('run npm test now');
  });

  it('drops horizontal rules', () => {
    expect(stripHtmlAndMarkdown('one\n---\ntwo')).toBe('one two');
  });

  it('still strips HTML tags', () => {
    expect(stripHtmlAndMarkdown('<p>hello <b>there</b></p>')).toBe(
      'hello there',
    );
  });

  it('collapses whitespace and trims', () => {
    expect(stripHtmlAndMarkdown('  a\n\n\tb  ')).toBe('a b');
  });
});
