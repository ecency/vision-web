import { text } from './text.method'
import { DOMParser } from '../consts'

describe('text() method - Text Node Processing', () => {
  let doc: Document

  beforeEach(() => {
    doc = DOMParser.parseFromString('<html><body></body></html>', 'text/html')
  })

  describe('linkification', () => {
    describe('plain text passthrough', () => {
      it('should not modify plain text without special content', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('This is plain text')
        parent.appendChild(textNode)

        text(textNode as any, false)

        expect(parent.textContent).toBe('This is plain text')
      })

      it('should not create links for plain URLs', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Check out https://example.com for more info')
        parent.appendChild(textNode)

        text(textNode as any, false)

        // Plain URLs are not linkified by text() - only special patterns
        expect(parent.textContent).toContain('https://example.com')
      })

      it('should preserve text with URLs', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Visit http://example.com today')
        parent.appendChild(textNode)

        text(textNode as any, false)

        expect(parent.textContent).toContain('http://example.com')
      })
    })

    describe('hashtag detection', () => {
      it('should convert hashtags to tag links', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('I love #bitcoin and #cryptocurrency')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const links = parent.getElementsByTagName('a')
        expect(links.length).toBeGreaterThan(0)
        const tagLinks = Array.from(links).filter(link =>
          link.getAttribute('class') === 'er-tag er-tag-link'
        )
        expect(tagLinks.length).toBe(2)
      })

      it('should not convert number-only hashtags', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Item #123 is not a tag')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const tagLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-tag er-tag-link'
        )
        expect(tagLinks.length).toBe(0)
      })

      it('should handle hashtags at start of text', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('#hive is awesome')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const tagLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-tag er-tag-link'
        )
        expect(tagLinks.length).toBe(1)
      })

      it('should handle hashtags with hyphens', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Check out #hive-engine tokens')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const tagLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-tag er-tag-link'
        )
        expect(tagLinks.length).toBe(1)
      })

      it('should handle multiple hashtags', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('#crypto #blockchain #hive')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const tagLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-tag er-tag-link'
        )
        expect(tagLinks.length).toBe(3)
      })

      it('should set correct attributes for web mode', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('I love #bitcoin')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const tagLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-tag er-tag-link'
        )
        expect(tagLinks[0]?.getAttribute('href')).toBe('/trending/bitcoin')
      })

      it('should set correct attributes for app mode', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('I love #bitcoin')
        parent.appendChild(textNode)

        text(textNode as any, true)

        const tagLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'markdown-tag-link'
        )
        expect(tagLinks[0]?.getAttribute('data-tag')).toBe('bitcoin')
      })
    })

    describe('@mention detection', () => {
      it('should convert @mentions to author links', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Thanks @alice and @bob for the help')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const authorLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-author er-author-link'
        )
        expect(authorLinks.length).toBe(2)
      })

      it('should handle @mentions at start of text', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('@alice great post!')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const authorLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-author er-author-link'
        )
        expect(authorLinks.length).toBe(1)
      })

      it('should handle usernames with dots', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Hello @user.name')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const authorLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-author er-author-link'
        )
        expect(authorLinks.length).toBe(1)
      })

      it('should handle usernames with hyphens', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Thanks @user-name')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const authorLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-author er-author-link'
        )
        expect(authorLinks.length).toBe(1)
      })

      it('should set correct attributes for web mode', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Hello @alice')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const authorLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-author er-author-link'
        )
        expect(authorLinks[0]?.getAttribute('href')).toBe('/@alice')
      })

      it('should set correct attributes for app mode', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Hello @alice')
        parent.appendChild(textNode)

        text(textNode as any, true)

        const authorLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'markdown-author-link'
        )
        expect(authorLinks[0]?.getAttribute('data-author')).toBe('alice')
      })

      it('should not convert invalid short usernames', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Email @ab is too short')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const authorLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-author er-author-link'
        )
        expect(authorLinks.length).toBe(0)
      })
    })

    describe('internal post links', () => {
      it('should convert @author/permlink to post links', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('See @alice/my-post for details')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'markdown-post-link'
        )
        // Bare @author/permlink should no longer be treated as internal post links
        // Only /@author/permlink (with leading /) should match
        expect(postLinks.length).toBe(0)
      })

      it('should convert /@author/permlink to post links', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Check /@alice/my-post')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'markdown-post-link'
        )
        expect(postLinks.length).toBe(1)
      })

      it('should set correct attributes for web mode', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('See /@alice/my-post')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'markdown-post-link'
        )
        expect(postLinks[0]?.getAttribute('href')).toContain('@alice/my-post')
      })

      it('should set correct attributes for app mode', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('See /@alice/my-post')
        parent.appendChild(textNode)

        text(textNode as any, true)

        const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'markdown-post-link'
        )
        expect(postLinks[0]?.getAttribute('data-author')).toBe('alice')
        expect(postLinks[0]?.getAttribute('data-permlink')).toBe('my-post')
      })

      it('should sanitize permlinks with query params', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('See /@alice/my-post?foo=bar')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'markdown-post-link'
        )
        expect(postLinks[0]?.textContent).toContain('my-post')
      })

      it('should reject permlinks with image extensions', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('See @alice/image.jpg')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'markdown-post-link'
        )
        expect(postLinks.length).toBe(0)
      })
    })

    describe('mixed content', () => {
      it('should handle hashtags and mentions together (URLs not linkified)', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('Check out site by @alice about #blockchain')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const allLinks = parent.getElementsByTagName('a')
        expect(allLinks.length).toBeGreaterThanOrEqual(2)
      })

      it('should handle hashtags and mentions in same sentence', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('@alice wrote about #hive and #crypto')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const authorLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-author er-author-link'
        )
        const tagLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
          link.getAttribute('class') === 'er-tag er-tag-link'
        )
        expect(authorLinks.length).toBe(1)
        expect(tagLinks.length).toBe(2)
      })

      it('should handle post links and mentions', () => {
        const parent = doc.createElement('p')
        doc.body?.appendChild(parent)
        const textNode = doc.createTextNode('See /@alice/my-post by @bob')
        parent.appendChild(textNode)

        text(textNode as any, false)

        const allLinks = parent.getElementsByTagName('a')
        expect(allLinks.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe('image detection', () => {
    it('should convert image URLs to img elements', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://example.com/image.jpg')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const images = parent.getElementsByTagName('img')
      expect(images.length).toBeGreaterThan(0)
    })

    it('should handle PNG images', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://example.com/photo.png')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const images = parent.getElementsByTagName('img')
      expect(images.length).toBeGreaterThan(0)
    })

    it('should handle GIF images', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://example.com/animation.gif')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const images = parent.getElementsByTagName('img')
      expect(images.length).toBeGreaterThan(0)
    })

    it('should handle WebP images', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://example.com/image.webp')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const images = parent.getElementsByTagName('img')
      expect(images.length).toBeGreaterThan(0)
    })

  })

  describe('YouTube video detection', () => {
    it('should convert YouTube URLs to video embeds', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const videoLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class')?.includes('markdown-video-link-youtube')
      )
      expect(videoLinks.length).toBe(1)
    })

    it('should handle YouTube short URLs', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://youtu.be/dQw4w9WgXcQ')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const videoLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class')?.includes('markdown-video-link-youtube')
      )
      expect(videoLinks.length).toBe(1)
      expect(videoLinks[0].getAttribute('class')).not.toContain('portrait')
    })

    it('should handle YouTube shorts', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://www.youtube.com/shorts/dQw4w9WgXcQ')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const videoLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class')?.includes('markdown-video-link-youtube')
      )
      expect(videoLinks.length).toBe(1)
      // #1271: the /shorts/ path is the only orientation signal
      expect(videoLinks[0].getAttribute('class')).toContain('markdown-video-link-youtube-portrait')
    })

    it('should extract start time from t parameter', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const videoLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class')?.includes('markdown-video-link-youtube')
      )
      expect(videoLinks[0]?.getAttribute('data-start-time')).toBe('123')
    })

    it('should extract start time from start parameter', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=456')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const videoLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class')?.includes('markdown-video-link-youtube')
      )
      expect(videoLinks[0]?.getAttribute('data-start-time')).toBe('456')
    })

    it('should add thumbnail image', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const images = parent.getElementsByTagName('img')
      expect(images.length).toBeGreaterThan(0)
      expect(images[0]?.getAttribute('class')).toContain('video-thumbnail')
    })

    it('should add play button', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const playButtons = Array.from(parent.getElementsByTagName('span')).filter(span =>
        span.getAttribute('class') === 'markdown-video-play'
      )
      expect(playButtons.length).toBe(1)
    })
  })

  describe('Hive post URL detection', () => {
    it('should convert ecency.com post URLs to post links', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://ecency.com/hive/@alice/my-post')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-post-link'
      )
      expect(postLinks.length).toBe(1)
    })

    it('should convert peakd.com post URLs to post links', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://peakd.com/hive/@alice/my-post')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-post-link'
      )
      expect(postLinks.length).toBe(1)
    })

    it('should convert hive.blog post URLs to post links', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://hive.blog/hive/@alice/my-post')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-post-link'
      )
      expect(postLinks.length).toBe(1)
    })

    it('should handle www prefix', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://www.ecency.com/hive/@alice/my-post')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-post-link'
      )
      expect(postLinks.length).toBe(1)
    })

    it('should validate tag format', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://ecency.com/valid-tag/@alice/my-post')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-post-link'
      )
      expect(postLinks.length).toBe(1)
    })

    it('should reject invalid tag with special chars', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://ecency.com/invalid<tag>/@alice/my-post')
      parent.appendChild(textNode)

      text(textNode as any, false)

      // Should not create a post link due to invalid tag
      expect(parent.textContent).toContain('https://ecency.com')
    })

    it('should validate username', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://ecency.com/hive/@alice/my-post')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-post-link'
      )
      expect(postLinks.length).toBe(1)
    })

    it('should reject invalid short username', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://ecency.com/hive/@ab/my-post')
      parent.appendChild(textNode)

      text(textNode as any, false)

      // Should not create a post link due to invalid username
      expect(parent.textContent).toContain('https://ecency.com')
    })

    it('should validate permlink', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://ecency.com/hive/@alice/valid-permlink-2024')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-post-link'
      )
      expect(postLinks.length).toBe(1)
    })

    it('should reject permlink with image extension', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://ecency.com/hive/@alice/image.jpg')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-post-link'
      )
      expect(postLinks.length).toBe(0)
    })

    it('should set correct attributes for web mode', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://ecency.com/hive/@alice/my-post')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-post-link'
      )
      expect(postLinks[0]?.getAttribute('href')).toBe('/@alice/my-post')
    })

    it('should set correct attributes for app mode', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://ecency.com/hive/@alice/my-post')
      parent.appendChild(textNode)

      text(textNode as any, true)

      const postLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-post-link'
      )
      expect(postLinks[0]?.getAttribute('data-tag')).toBe('hive')
      expect(postLinks[0]?.getAttribute('data-author')).toBe('alice')
      expect(postLinks[0]?.getAttribute('data-permlink')).toBe('my-post')
    })
  })

  describe('security', () => {
    it('should not execute scripts in text content', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('<script>alert("XSS")</script>')
      parent.appendChild(textNode)

      text(textNode as any, false)

      // Text content should be safe - scripts won't execute
      expect(parent.textContent).toContain('<script>')
      const scripts = parent.getElementsByTagName('script')
      expect(scripts.length).toBe(0)
    })

    it('should handle malicious hashtags safely', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('#<script>alert(1)</script>')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const scripts = parent.getElementsByTagName('script')
      expect(scripts.length).toBe(0)
    })

    it('should handle malicious mentions safely', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('@<script>alert(1)</script>')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const scripts = parent.getElementsByTagName('script')
      expect(scripts.length).toBe(0)
    })

    it('should validate tag format to prevent XSS', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://ecency.com/"><script>alert(1)</script>/@alice/post')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const scripts = parent.getElementsByTagName('script')
      expect(scripts.length).toBe(0)
    })

    it('should sanitize permlinks to prevent XSS', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://ecency.com/hive/@alice/post?"><script>alert(1)</script>')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const scripts = parent.getElementsByTagName('script')
      expect(scripts.length).toBe(0)
    })

    it('should not allow javascript: URLs in links', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('javascript:alert(1)')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const links = parent.getElementsByTagName('a')
      const hasJavascriptHref = Array.from(links).some(link =>
        link.getAttribute('href')?.toLowerCase().includes('javascript:')
      )
      expect(hasJavascriptHref).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle null node', () => {
      expect(() => text(null, false)).not.toThrow()
    })

    it('should handle node without parent', () => {
      const textNode = doc.createTextNode('Hello world')
      expect(() => text(textNode as any, false)).not.toThrow()
    })

    it('should skip processing when parent is <a> tag', () => {
      const parent = doc.createElement('a')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('https://example.com')
      parent.appendChild(textNode)

      const originalText = parent.textContent
      text(textNode as any, false)

      // Should not process because parent is <a>
      expect(parent.textContent).toBe(originalText)
    })

    it('should skip processing when parent is <code> tag', () => {
      const parent = doc.createElement('code')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('#hashtag @mention')
      parent.appendChild(textNode)

      const originalText = parent.textContent
      text(textNode as any, false)

      // Should not process because parent is <code>
      expect(parent.textContent).toBe(originalText)
    })

    it('should skip processing when ancestor is <code> tag (nested)', () => {
      const code = doc.createElement('code')
      const em = doc.createElement('em')
      doc.body?.appendChild(code)
      code.appendChild(em)
      const textNode = doc.createTextNode('@aws-sdk')
      em.appendChild(textNode)

      text(textNode as any, false)

      // Should not process because ancestor is <code>
      // Check no anchor was inserted (textContent alone won't catch a wrapped <a>)
      expect(em.textContent).toBe('@aws-sdk')
      expect(code.getElementsByTagName('a').length).toBe(0)
    })

    it('should skip processing when ancestor is <pre> tag', () => {
      const pre = doc.createElement('pre')
      const code = doc.createElement('code')
      doc.body?.appendChild(pre)
      pre.appendChild(code)
      const textNode = doc.createTextNode('@hiveio #hashtag')
      code.appendChild(textNode)

      text(textNode as any, false)

      // Should not process because ancestor is <pre>
      expect(code.textContent).toBe('@hiveio #hashtag')
      expect(pre.getElementsByTagName('a').length).toBe(0)
    })

    it('should skip processing when text is inside <pre> without <code>', () => {
      const pre = doc.createElement('pre')
      doc.body?.appendChild(pre)
      const textNode = doc.createTextNode('@mention')
      pre.appendChild(textNode)

      text(textNode as any, false)

      expect(pre.textContent).toBe('@mention')
      expect(pre.getElementsByTagName('a').length).toBe(0)
    })

    it('should handle empty text nodes', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('')
      parent.appendChild(textNode)

      expect(() => text(textNode as any, false)).not.toThrow()
    })

    it('should handle whitespace-only text nodes', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('   \n\t  ')
      parent.appendChild(textNode)

      expect(() => text(textNode as any, false)).not.toThrow()
    })

    it('should handle very long text nodes', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const longText = 'a'.repeat(10000) + ' https://example.com ' + 'b'.repeat(10000)
      const textNode = doc.createTextNode(longText)
      parent.appendChild(textNode)

      expect(() => text(textNode as any, false)).not.toThrow()
    })

    it('should handle text with only spaces between content', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('   #crypto   @alice   ')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const links = parent.getElementsByTagName('a')
      expect(links.length).toBeGreaterThan(0)
    })

    it('should handle text with newlines', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('Line 1\n#hashtag\n@mention\nLine 4')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const links = parent.getElementsByTagName('a')
      expect(links.length).toBeGreaterThan(0)
    })

    it('should handle text with tabs', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('Text\t#hashtag\t@mention')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const links = parent.getElementsByTagName('a')
      expect(links.length).toBeGreaterThan(0)
    })

    it('should handle special Unicode characters', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('Hello 🌍 #crypto @alice')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const links = parent.getElementsByTagName('a')
      expect(links.length).toBeGreaterThan(0)
    })

    it('should preserve text with mixed case URLs', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('HTTPS://EXAMPLE.COM/PATH')
      parent.appendChild(textNode)

      text(textNode as any, false)

      // Plain URLs are not linkified
      expect(parent.textContent).toContain('HTTPS://EXAMPLE.COM/PATH')
    })

    it('should not process if nodeValue is null', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const element = doc.createElement('span')
      parent.appendChild(element)

      expect(() => text(element as any, false)).not.toThrow()
    })

    it('should handle text node with only punctuation', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('.,!?;:')
      parent.appendChild(textNode)

      expect(() => text(textNode as any, false)).not.toThrow()
    })
  })

  describe('forApp parameter', () => {
    it('should use data attributes when forApp is true', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('#crypto @alice')
      parent.appendChild(textNode)

      text(textNode as any, true)

      const tagLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-tag-link'
      )
      const authorLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'markdown-author-link'
      )

      expect(tagLinks[0]?.getAttribute('data-tag')).toBeTruthy()
      expect(authorLinks[0]?.getAttribute('data-author')).toBeTruthy()
    })

    it('should use href when forApp is false', () => {
      const parent = doc.createElement('p')
      doc.body?.appendChild(parent)
      const textNode = doc.createTextNode('#crypto @alice')
      parent.appendChild(textNode)

      text(textNode as any, false)

      const tagLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'er-tag er-tag-link'
      )
      const authorLinks = Array.from(parent.getElementsByTagName('a')).filter(link =>
        link.getAttribute('class') === 'er-author er-author-link'
      )

      expect(tagLinks[0]?.getAttribute('href')).toBeTruthy()
      expect(authorLinks[0]?.getAttribute('href')).toBeTruthy()
    })
  })
})
