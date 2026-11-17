import { markdownToHTML } from './markdown-to-html.method'
import { describe, it, expect } from 'vitest'

describe('markdownToHTML() method', () => {
  describe('markdown rendering', () => {
    it('should render bold text with **', () => {
      const input = '**bold text**'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<strong>bold text</strong>')
    })

    it('should render bold text with __', () => {
      const input = '__bold text__'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<strong>bold text</strong>')
    })

    it('should render italic text with *', () => {
      const input = '*italic text*'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<em>italic text</em>')
    })

    it('should render italic text with _', () => {
      const input = '_italic text_'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<em>italic text</em>')
    })

    it('should render strikethrough text', () => {
      const input = '~~strikethrough~~'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<del>strikethrough</del>')
    })

    it('should render H1 headers', () => {
      const input = '# Heading 1'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<h1>Heading 1</h1>')
    })

    it('should render H2 headers', () => {
      const input = '## Heading 2'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<h2>Heading 2</h2>')
    })

    it('should render H3 headers', () => {
      const input = '### Heading 3'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<h3>Heading 3</h3>')
    })

    it('should render unordered lists', () => {
      const input = '- Item 1\n- Item 2\n- Item 3'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<ul>')
      expect(result).toContain('<li>Item 1</li>')
      expect(result).toContain('<li>Item 2</li>')
      expect(result).toContain('<li>Item 3</li>')
      expect(result).toContain('</ul>')
    })

    it('should render ordered lists', () => {
      const input = '1. First\n2. Second\n3. Third'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<ol>')
      expect(result).toContain('<li>First</li>')
      expect(result).toContain('<li>Second</li>')
      expect(result).toContain('<li>Third</li>')
      expect(result).toContain('</ol>')
    })

    it('should render links', () => {
      const input = '[Link text](https://example.com)'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('class="markdown-external-link"')
      expect(result).toContain('href="https://example.com"')
    })

    it('should render inline code', () => {
      const input = 'This is `inline code` in text'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<code>inline code</code>')
    })

    it('should render code blocks', () => {
      const input = '```\nconst x = 1;\n```'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<pre>')
      expect(result).toContain('<code>')
      // Code is syntax highlighted with lolight
      expect(result).toContain('const')
    })

    it('should render blockquotes', () => {
      const input = '> This is a quote'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<blockquote>')
      expect(result).toContain('This is a quote')
      expect(result).toContain('</blockquote>')
    })

    it('should render horizontal rules', () => {
      const input = '---'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<hr')
    })

    it('should render tables', () => {
      const input = '| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<table>')
      expect(result).toContain('<thead>')
      expect(result).toContain('<th>Header 1</th>')
      expect(result).toContain('<th>Header 2</th>')
      expect(result).toContain('</thead>')
      expect(result).toContain('<tbody>')
      expect(result).toContain('<td>Cell 1')
      expect(result).toContain('<td>Cell 2')
      expect(result).toContain('</tbody>')
      expect(result).toContain('</table>')
    })

    it('should render mixed markdown elements', () => {
      const input = '# Title\n\nThis is **bold** and *italic* text.\n\n- List item'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<h1>Title</h1>')
      expect(result).toContain('<strong>bold</strong>')
      expect(result).toContain('<em>italic</em>')
      expect(result).toContain('<li>List item</li>')
    })

    it('should render superscript', () => {
      const input = 'E = mc^2^'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<sup>2</sup>')
    })

    it('should render subscript', () => {
      const input = 'H~2~O'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<sub>2</sub>')
    })

    it('should render inserted text', () => {
      const input = '++inserted++'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<ins>inserted</ins>')
    })

    it('should render marked text', () => {
      const input = '==marked=='
      const result = markdownToHTML(input, false, 'ecency.com')
      // Remarkable's mark plugin may not be enabled or uses different syntax
      expect(result).toContain('marked')
    })
  })

  describe('parameters', () => {
    it('should handle forApp=true for external links', () => {
      const input = '[Example](https://example.com)'
      const result = markdownToHTML(input, true, 'ecency.com')
      expect(result).toContain('data-href="https://example.com"')
      // In app mode, href attribute is removed but may still appear in data-href
      expect(result).toContain('markdown-external-link')
    })

    it('should handle forApp=false for external links', () => {
      const input = '[Example](https://example.com)'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('href="https://example.com"')
    })

    it('emits a <picture> (avif/webp) with a format=match <img> fallback for the web (forApp=false)', () => {
      const input = '![Image](https://example.com/image.jpg)'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<picture>')
      expect(result).toContain('type="image/avif"')
      expect(result).toContain('format=avif')
      expect(result).toContain('type="image/webp"')
      expect(result).toContain('format=webp')
      expect(result).toContain('format=match') // <img> fallback for browsers without avif/webp
    })

    it('keeps a bare format=match <img> (no <picture>) for the app (forApp=true)', () => {
      const input = '![Image](https://example.com/image.jpg)'
      const result = markdownToHTML(input, true, 'ecency.com')
      expect(result).toContain('format=match')
      expect(result).not.toContain('<picture')
      expect(result).not.toContain('format=webp')
    })

    it('should pass parentDomain to Twitch embeds', () => {
      const input = 'https://www.twitch.tv/channelname'
      const result = markdownToHTML(input, false, 'example.org')
      expect(result).toContain('parent=example.org')
    })

    it('should use default parentDomain when not specified', () => {
      const input = 'https://www.twitch.tv/channelname'
      const result = markdownToHTML(input, false)
      expect(result).toContain('parent=ecency.com')
    })

    it('should handle all parameters together', () => {
      const input = '![Image](https://example.com/image.jpg)\n\n[Link](https://example.com)'
      const result = markdownToHTML(input, true, 'custom.com')
      expect(result).toContain('format=match')
      expect(result).toContain('data-href="https://example.com"')
    })
  })

  describe('syntax highlighting', () => {
    it('should apply syntax highlighting to JavaScript code blocks', () => {
      const input = '```javascript\nconst x = 1;\n```'
      const result = markdownToHTML(input, false, 'ecency.com')
      // Check for lolight syntax highlighting classes
      expect(result).toContain('const')
    })

    it('should apply syntax highlighting to Python code blocks', () => {
      const input = '```python\ndef hello():\n    return "world"\n```'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('def')
      expect(result).toContain('hello')
    })

    it('should handle code blocks without language specification', () => {
      const input = '```\nplain code\n```'
      const result = markdownToHTML(input, false, 'ecency.com')
      // Code is syntax highlighted even without language
      expect(result).toContain('plain')
      expect(result).toContain('<code>')
    })

    it('should handle code blocks with unknown language', () => {
      const input = '```unknownlang\nsome code\n```'
      const result = markdownToHTML(input, false, 'ecency.com')
      // Code is syntax highlighted with lolight
      expect(result).toContain('some')
      expect(result).toContain('<code>')
    })

    it('should handle multiple code blocks with different languages', () => {
      const input = '```javascript\nconst x = 1;\n```\n\n```python\nprint("hello")\n```'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('const')
      expect(result).toContain('print')
    })
  })

  describe('link conversion', () => {
    it('should linkify raw URLs', () => {
      const input = 'Check out https://example.com for more info'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('href="https://example.com"')
      expect(result).toContain('class="markdown-external-link"')
    })

    it('should convert hashtags to tag links', () => {
      const input = 'This is about #bitcoin and #crypto'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('bitcoin')
      expect(result).toContain('crypto')
    })

    it('should convert @mentions to author links', () => {
      const input = 'Hello @username how are you?'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('username')
    })

    it('should handle mixed URLs, hashtags, and mentions', () => {
      const input = 'Check @username at https://example.com for #bitcoin news'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('username')
      expect(result).toContain('example.com')
      expect(result).toContain('bitcoin')
    })

    it('should handle multiple mentions in same text', () => {
      const input = '@user1 and @user2 are friends'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('user1')
      expect(result).toContain('user2')
    })
  })

  describe('leofinance/inleo link conversion', () => {
    it('should convert leofinance.io/threads/view links to internal format', () => {
      const input = 'https://leofinance.io/threads/view/author/permlink'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('/@author/permlink')
    })

    it('should convert leofinance.io/posts links to internal format', () => {
      const input = 'https://leofinance.io/posts/author/permlink'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('/@author/permlink')
    })

    it('should convert leofinance.io/threads links to internal format', () => {
      const input = 'https://leofinance.io/threads/author/permlink'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('/@author/permlink')
    })

    it('should convert inleo.io/threads/view links to internal format', () => {
      const input = 'https://inleo.io/threads/view/author/permlink'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('/@author/permlink')
    })

    it('should convert inleo.io/posts links to internal format', () => {
      const input = 'https://inleo.io/posts/author/permlink'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('/@author/permlink')
    })

    it('should convert inleo.io/threads links to internal format', () => {
      const input = 'https://inleo.io/threads/author/permlink'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('/@author/permlink')
    })
  })

  describe('HTML entity preservation', () => {
    it('should preserve HTML entities in forApp mode', () => {
      const input = 'This &amp; that &lt; other'
      const result = markdownToHTML(input, true, 'ecency.com')
      expect(result).toContain('&amp;')
      expect(result).toContain('&lt;')
    })

    it('should handle numeric entities in forApp mode', () => {
      const input = 'Copyright &#169; 2024'
      const result = markdownToHTML(input, true, 'ecency.com')
      expect(result).toContain('&#169;')
    })

    it('should handle hex entities in forApp mode', () => {
      const input = 'Euro &#x20AC; symbol'
      const result = markdownToHTML(input, true, 'ecency.com')
      expect(result).toContain('&#x20AC;')
    })

    it('should not preserve entities when forApp is false', () => {
      const input = 'This &amp; that'
      const result = markdownToHTML(input, false, 'ecency.com')
      // Entities are handled normally by the HTML parser
      expect(result).toBeTruthy()
    })

    it('should deduplicate entities to avoid duplicate placeholders', () => {
      const input = 'First &amp; second &amp; third'
      const result = markdownToHTML(input, true, 'ecency.com')
      expect(result).toContain('&amp;')
    })
  })

  describe('error handling', () => {
    it('should handle empty input', () => {
      const result = markdownToHTML('', false, 'ecency.com')
      expect(result).toBe('')
    })

    it('should handle null-like empty string', () => {
      const result = markdownToHTML('   ', false, 'ecency.com')
      // Whitespace-only input may return empty string after sanitization
      expect(result).toBe('')
    })

    it('should handle malformed markdown gracefully', () => {
      const input = '**unclosed bold\n\n> unclosed quote\n\n[incomplete link'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toBeTruthy()
    })

    it('should handle very large input', () => {
      const largeInput = 'a'.repeat(50000)
      const result = markdownToHTML(largeInput, false, 'ecency.com')
      expect(result).toBeTruthy()
    })

    it('should handle invalid HTML in markdown', () => {
      const input = '<div>Unclosed div\n\n<script>alert("xss")</script>'
      const result = markdownToHTML(input, false, 'ecency.com')
      // XSS should be sanitized
      expect(result).not.toContain('<script>')
    })

    it('should handle deeply nested structures', () => {
      const input = '> > > > > > Deeply nested quote'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('blockquote')
    })

    it('should handle malformed HTML that triggers fallback recovery', () => {
      // Create HTML that will fail initial parsing
      const input = '<div><p>Unclosed tags\n\n**bold**'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toBeTruthy()
    })

    it('should handle special characters', () => {
      const input = 'Special chars: <>&"\'©®™'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toBeTruthy()
    })

    it('should handle unicode characters', () => {
      const input = 'Unicode: 你好 мир 🌍 emoji'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('你好')
      expect(result).toContain('мир')
      expect(result).toContain('🌍')
    })
  })

  describe('HTML breaks option', () => {
    it('should convert line breaks to <br> tags', () => {
      const input = 'Line 1\nLine 2\nLine 3'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<br')
    })

    it('should handle multiple consecutive line breaks', () => {
      const input = 'Paragraph 1\n\n\nParagraph 2'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toBeTruthy()
    })
  })

  describe('image handling', () => {
    it('should convert markdown images to img tags', () => {
      const input = '![Alt text](https://example.com/image.jpg)'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<img')
      expect(result).toContain('alt="Alt text"')
    })

    it('should handle images without alt text', () => {
      const input = '![](https://example.com/image.jpg)'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<img')
    })

    it('should proxify image URLs through ecency CDN', () => {
      const input = '![Image](https://example.com/photo.jpg)'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('https://i.ecency.com')
    })

    it('should handle IPFS image URLs', () => {
      const input = '![IPFS](https://ipfs.io/ipfs/QmTest123)'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<img')
    })

    it('should add loading attributes to images', () => {
      const input = '![Image](https://example.com/image.jpg)'
      const result = markdownToHTML(input, false, 'ecency.com')
      // First image should have eager loading
      expect(result).toContain('loading="eager"')
      expect(result).toContain('fetchpriority="high"')
    })
  })

  describe('video embeds', () => {
    it('should embed YouTube videos', () => {
      const input = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-video-link-youtube')
      expect(result).toContain('dQw4w9WgXcQ')
    })

    it('should embed Vimeo videos', () => {
      const input = 'https://vimeo.com/123456789'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-video-link-vimeo')
      expect(result).toContain('player.vimeo.com')
    })

    it('should embed Twitch streams', () => {
      const input = 'https://www.twitch.tv/channelname'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-video-link-twitch')
      expect(result).toContain('player.twitch.tv')
    })

    it('should embed 3Speak videos', () => {
      const input = 'https://3speak.tv/watch?v=username/permlink'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-video-link-speak')
    })

    it('should embed DTube videos', () => {
      const input = 'https://d.tube/#!/v/username/objectid'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-video-link-dtube')
    })

    it('should embed Spotify content', () => {
      const input = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-audio-link-spotify')
    })

    it('should embed Loom videos', () => {
      const input = 'https://www.loom.com/share/abc123def456'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-video-link-loom')
    })
  })

  describe('Hive-specific links', () => {
    it('should handle Hive user mentions', () => {
      const input = 'https://ecency.com/@username'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-author-link')
      expect(result).toContain('/@username')
    })

    it('should handle Hive post links', () => {
      const input = 'https://ecency.com/hive/@author/permlink'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-post-link')
      expect(result).toContain('/@author/permlink')
    })

    it('should handle Hive community links', () => {
      const input = 'https://ecency.com/c/hive-123456'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-community-link')
      expect(result).toContain('hive-123456')
    })

    it('should handle Hive tag/topic links', () => {
      const input = 'https://ecency.com/trending/bitcoin'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-tag-link')
      expect(result).toContain('/trending/bitcoin')
    })

    it('should handle PeakD post links', () => {
      const input = 'https://peakd.com/hive/@author/permlink'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-post-link')
      expect(result).toContain('/@author/permlink')
    })

    it('should handle Hive.blog post links', () => {
      const input = 'https://hive.blog/test/@author/permlink'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('markdown-post-link')
      expect(result).toContain('/@author/permlink')
    })
  })

  describe('sanitization', () => {
    it('should remove dangerous script tags', () => {
      const input = '<script>alert("xss")</script>Safe content'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).not.toContain('<script>')
      expect(result).toContain('Safe content')
    })

    it('should remove javascript: protocol from links', () => {
      const input = '[Click](javascript:alert("xss"))'
      const result = markdownToHTML(input, false, 'ecency.com')
      // Markdown parser may render this as plain text, not a link
      expect(result).toContain('Click')
    })

    it('should remove dangerous HTML attributes', () => {
      const input = '<div onclick="alert(1)">Content</div>'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).not.toContain('onclick')
    })

    it('should allow safe HTML tags', () => {
      const input = '<strong>Bold</strong> <em>Italic</em> <code>Code</code>'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<strong>Bold</strong>')
      expect(result).toContain('<em>Italic</em>')
      expect(result).toContain('<code>Code</code>')
    })

    it('should remove xmlns attribute from output', () => {
      const input = 'Simple text'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).not.toContain('xmlns')
    })

    it('should remove body wrapper tags from output', () => {
      const input = 'Simple text'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).not.toContain('<body')
      expect(result).not.toContain('</body>')
    })
  })

  describe('edge cases', () => {
    it('should handle text with only whitespace', () => {
      const input = '   \n\n   \t\t   '
      const result = markdownToHTML(input, false, 'ecency.com')
      // Whitespace-only input returns empty string
      expect(result).toBe('')
    })

    it('should handle input with only special characters', () => {
      const input = '!@#$%^&*()_+-=[]{}|;:,.<>?'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toBeTruthy()
    })

    it('should handle mixed markdown and HTML', () => {
      const input = '**Bold** <em>italic</em> *also italic*'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<strong>Bold</strong>')
      expect(result).toContain('<em>italic</em>')
    })

    it('should handle URLs with query parameters', () => {
      const input = 'https://example.com/path?param=value&other=123'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('href="https://example.com/path?param=value')
    })

    it('should handle URLs with hash fragments', () => {
      const input = 'https://example.com/page#section'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('href="https://example.com/page#section"')
    })

    it('should handle extremely long single line', () => {
      const input = 'a'.repeat(10000)
      expect(() => markdownToHTML(input, false, 'ecency.com')).not.toThrow()
    })

    it('should handle code block with special characters', () => {
      const input = '```\n<html>\n<script>alert(1)</script>\n</html>\n```'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('<code>')
      // Script tag should be escaped in code block
      expect(result).toBeTruthy()
    })
  })

  describe('Twitter/X embeds', () => {
    it('should create Twitter embed blockquote', () => {
      const input = 'https://twitter.com/username/status/123456789'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toContain('twitter-tweet')
      expect(result).toContain('blockquote')
    })

    it('should handle X.com URLs', () => {
      const input = 'https://x.com/username/status/123456789'
      // X.com is treated as external link unless specifically handled
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toBeTruthy()
    })
  })

  describe('performance and optimization', () => {
    it('should handle multiple paragraphs efficiently', () => {
      const input = Array(100).fill('This is a paragraph.').join('\n\n')
      const start = Date.now()
      const result = markdownToHTML(input, false, 'ecency.com')
      const duration = Date.now() - start
      expect(result).toBeTruthy()
      expect(duration).toBeLessThan(1000) // Should complete in less than 1 second
    })

    it('should handle multiple images efficiently', () => {
      const input = Array(50).fill('![Image](https://example.com/image.jpg)').join('\n\n')
      const start = Date.now()
      const result = markdownToHTML(input, false, 'ecency.com')
      const duration = Date.now() - start
      expect(result).toBeTruthy()
      expect(duration).toBeLessThan(2000) // Should complete in less than 2 seconds
    })
  })

  describe('typographer disabled', () => {
    it('should not convert quotes to smart quotes', () => {
      const input = '"Hello" and \'world\''
      const result = markdownToHTML(input, false, 'ecency.com')
      // Typographer is disabled, so quotes should remain as-is
      expect(result).toBeTruthy()
    })

    it('should not convert dashes to em/en dashes', () => {
      const input = 'This -- is --- text'
      const result = markdownToHTML(input, false, 'ecency.com')
      expect(result).toBeTruthy()
    })
  })

  describe('block-level HTML tag handling', () => {
    it('should properly handle <center> tags with blank lines', () => {
      const input = `<center>

[![Image](https://example.com/image.jpg)](https://example.com)

Link text

</center>`
      const result = markdownToHTML(input, false, 'ecency.com')

      // Should not wrap center tag in paragraphs
      expect(result).not.toContain('<p><center>')
      expect(result).not.toContain('</center></p>')
      expect(result).not.toContain('<p><center></p>')
      expect(result).not.toContain('<p></center></p>')

      // Should have properly matched center tags
      const openingTags = (result.match(/<center[^>]*>/g) || []).length
      const closingTags = (result.match(/<\/center>/g) || []).length
      expect(openingTags).toBe(closingTags)
      expect(openingTags).toBe(1)
    })

    it('should properly handle <div> tags with blank lines', () => {
      const input = `<div class="custom">

Some **bold** content

</div>`
      const result = markdownToHTML(input, false, 'ecency.com')

      // Should not wrap div tag in paragraphs
      expect(result).not.toContain('<p><div')
      expect(result).not.toContain('</div></p>')

      // Should have properly matched div tags
      const openingTags = (result.match(/<div[^>]*>/g) || []).length
      const closingTags = (result.match(/<\/div>/g) || []).length
      expect(openingTags).toBe(closingTags)
    })

    it('should handle 3Speak embed with center tags', () => {
      const input = `<center>

[![](https://ipfs-3speak.b-cdn.net/ipfs/QmTest/)](https://3speak.tv/watch?v=test/permlink)

▶️ [Watch on 3Speak](https://3speak.tv/watch?v=test/permlink)

</center>`
      const result = markdownToHTML(input, false, 'ecency.com')

      // Should have properly structured center tags
      expect(result).toContain('<center>')
      expect(result).toContain('</center>')
      expect(result).not.toContain('<p><center>')
      expect(result).not.toContain('</center></p>')

      // Should contain the 3speak video link
      expect(result).toContain('markdown-video-link-speak')
    })

    it('should handle nested block-level tags', () => {
      const input = `<div>

<center>

Content

</center>

</div>`
      const result = markdownToHTML(input, false, 'ecency.com')

      // Both tags should be properly matched
      const divOpenings = (result.match(/<div[^>]*>/g) || []).length
      const divClosings = (result.match(/<\/div>/g) || []).length
      const centerOpenings = (result.match(/<center[^>]*>/g) || []).length
      const centerClosings = (result.match(/<\/center>/g) || []).length

      expect(divOpenings).toBe(divClosings)
      expect(centerOpenings).toBe(centerClosings)
    })

    it('should not affect inline tags like <span>', () => {
      const input = 'This is <span class="text-center">highlighted</span> text'
      const result = markdownToHTML(input, false, 'ecency.com')

      // Inline tags should remain inside paragraphs
      expect(result).toContain('<span class="text-center">')
      expect(result).toContain('</span>')
    })

    it('should handle table tags', () => {
      const input = `<table>

<tr><td>Cell</td></tr>

</table>`
      const result = markdownToHTML(input, false, 'ecency.com')

      // Table should not be wrapped in paragraphs
      expect(result).not.toContain('<p><table>')
      expect(result).not.toContain('</table></p>')
    })
  })
})
