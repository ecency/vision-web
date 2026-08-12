import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape-html';

describe('escapeHtml', () => {
  it('escapes markup metacharacters', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('removes XML-invalid control characters and non-characters', () => {
    // One chain-authored control char must not unparse a whole feed.
    expect(escapeHtml('a\u0000b\u000Bc\u001Fd\uFFFEe')).toBe('abcde');
    // Tab and newlines are VALID XML and survive.
    expect(escapeHtml('a\tb\nc')).toBe('a\tb\nc');
  });

  it('removes lone surrogate halves but keeps real astral pairs', () => {
    expect(escapeHtml('a\uD800b')).toBe('ab');
    expect(escapeHtml('a\uDC00b')).toBe('ab');
    expect(escapeHtml('a😀b')).toBe('a😀b');
  });
});
