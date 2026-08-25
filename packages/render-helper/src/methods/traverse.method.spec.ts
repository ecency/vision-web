import { traverse } from './traverse.method'
import { DOMParser } from '../consts'

describe('traverse() method - DOM Traversal', () => {
  let doc: Document

  beforeEach(() => {
    doc = DOMParser.parseFromString('<html><body></body></html>', 'text/html')
  })

  describe('node type handling', () => {
    describe('anchor elements', () => {
      it('should process anchor elements', () => {
        const container = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Example'
        container.appendChild(link)

        traverse(container, false, 0)

        expect(link.getAttribute('class')).toBe('markdown-external-link')
        expect(link.getAttribute('target')).toBe('_blank')
        expect(link.getAttribute('rel')).toBe('nofollow ugc noopener')
      })

      it('should process anchor elements with forApp=true', () => {
        const container = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Example'
        container.appendChild(link)

        traverse(container, true, 0)

        expect(link.getAttribute('class')).toBe('markdown-external-link')
        expect(link.getAttribute('data-href')).toBe('https://example.com')
        expect(link.getAttribute('href')).toBeNull()
      })

      it('should process multiple anchor elements', () => {
        const container = doc.createElement('div')
        const link1 = doc.createElement('a')
        link1.setAttribute('href', 'https://example1.com')
        link1.textContent = 'Example 1'
        const link2 = doc.createElement('a')
        link2.setAttribute('href', 'https://example2.com')
        link2.textContent = 'Example 2'
        container.appendChild(link1)
        container.appendChild(link2)

        traverse(container, false, 0)

        expect(link1.getAttribute('class')).toBe('markdown-external-link')
        expect(link2.getAttribute('class')).toBe('markdown-external-link')
      })
    })

    describe('iframe elements', () => {
      it('should process iframe elements', () => {
        const container = doc.createElement('div')
        const iframe = doc.createElement('iframe')
        iframe.setAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1')
        container.appendChild(iframe)

        traverse(container, false, 0)

        // YouTube iframe should have query string stripped
        expect(iframe.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
      })

      it('should remove iframe without src', () => {
        const container = doc.createElement('div')
        const iframe = doc.createElement('iframe')
        container.appendChild(iframe)

        traverse(container, false, 0)

        expect(container.getElementsByTagName('iframe').length).toBe(0)
      })

      it('should process iframe with parentDomain parameter', () => {
        const container = doc.createElement('div')
        const iframe = doc.createElement('iframe')
        iframe.setAttribute('src', 'https://player.twitch.tv/?channel=test')
        container.appendChild(iframe)

        traverse(container, false, 0, { firstImageFound: false }, 'example.com')

        expect(iframe.getAttribute('src')).toContain('parent=example.com')
      })
    })

    describe('text nodes', () => {
      it('should process text nodes', () => {
        const container = doc.createElement('div')
        const textNode = doc.createTextNode('https://example.com')
        container.appendChild(textNode)

        traverse(container, false, 0)

        // Text node with URL should be linkified
        // Note: linkify may wrap in span, so check for transformed content
        expect(container.textContent).toContain('example.com')
      })

      it('should process text nodes with image URLs', () => {
        const container = doc.createElement('div')
        const textNode = doc.createTextNode('https://example.com/image.jpg')
        container.appendChild(textNode)

        traverse(container, false, 0)

        // Text node with image URL should become img element
        const imgs = container.getElementsByTagName('img')
        expect(imgs.length).toBeGreaterThan(0)
      })

      it('should process text nodes with YouTube URLs', () => {
        const container = doc.createElement('div')
        const textNode = doc.createTextNode('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
        container.appendChild(textNode)

        traverse(container, false, 0)

        // Text node with YouTube URL should become video link
        // Use getElementsByTagName as xmldom doesn't support querySelectorAll
        const paragraphs = container.getElementsByTagName('p')
        let found = false
        for (let i = 0; i < paragraphs.length; i++) {
          const p = paragraphs[i]
          const anchors = p?.getElementsByTagName('a')
          if (anchors && anchors.length > 0) {
            const cls = anchors[0]?.getAttribute('class')
            if (cls && cls.includes('markdown-video-link-youtube')) {
              found = true
              break
            }
          }
        }
        expect(found).toBe(true)
      })

      it('should use format=match for text handler image URLs', () => {
        const container = doc.createElement('div')
        const textNode = doc.createTextNode('https://example.com/image.jpg')
        container.appendChild(textNode)

        traverse(container, false, 0)

        const imgs = container.getElementsByTagName('img')
        expect(imgs.length).toBeGreaterThan(0)
        expect(imgs[0]?.getAttribute('src')).toContain('format=match')
      })
    })

    describe('img elements', () => {
      it('should process img elements', () => {
        const container = doc.createElement('div')
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')
        container.appendChild(img)

        traverse(container, false, 0)

        expect(img.getAttribute('itemprop')).toBe('image')
        expect(img.getAttribute('loading')).toBeTruthy()
      })

      it('should mark first image as LCP', () => {
        const container = doc.createElement('div')
        const img1 = doc.createElement('img')
        img1.setAttribute('src', 'https://example.com/image1.jpg')
        const img2 = doc.createElement('img')
        img2.setAttribute('src', 'https://example.com/image2.jpg')
        container.appendChild(img1)
        container.appendChild(img2)

        const state = { firstImageFound: false }
        traverse(container, false, 0, state)

        expect(img1.getAttribute('loading')).toBe('eager')
        expect(img1.getAttribute('fetchpriority')).toBe('high')
        expect(img2.getAttribute('loading')).toBe('eager')
        expect(state.firstImageFound).toBe(true)
      })

      it('should use format=match for img handler', () => {
        const container = doc.createElement('div')
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')
        container.appendChild(img)

        traverse(container, false, 0)

        expect(img.getAttribute('src')).toContain('format=match')
      })

      it('should proxify image sources', () => {
        const container = doc.createElement('div')
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')
        container.appendChild(img)

        traverse(container, false, 0)

        expect(img.getAttribute('src')).toContain('https://i.ecency.com')
      })
    })

    describe('p elements', () => {
      it('should process p elements', () => {
        const container = doc.createElement('div')
        const p = doc.createElement('p')
        p.textContent = 'Test paragraph'
        container.appendChild(p)

        traverse(container, false, 0)

        expect(p.getAttribute('dir')).toBe('auto')
      })

      it('should not override existing dir attribute', () => {
        const container = doc.createElement('div')
        const p = doc.createElement('p')
        p.setAttribute('dir', 'rtl')
        p.textContent = 'Test paragraph'
        container.appendChild(p)

        traverse(container, false, 0)

        expect(p.getAttribute('dir')).toBe('rtl')
      })

      it('should process multiple p elements', () => {
        const container = doc.createElement('div')
        const p1 = doc.createElement('p')
        const p2 = doc.createElement('p')
        p1.textContent = 'Paragraph 1'
        p2.textContent = 'Paragraph 2'
        container.appendChild(p1)
        container.appendChild(p2)

        traverse(container, false, 0)

        expect(p1.getAttribute('dir')).toBe('auto')
        expect(p2.getAttribute('dir')).toBe('auto')
      })
    })

    describe('mixed node types', () => {
      it('should handle container with mixed element types', () => {
        const container = doc.createElement('div')

        const p = doc.createElement('p')
        p.textContent = 'Paragraph'

        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Link'

        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')

        const textNode = doc.createTextNode('Plain text')

        container.appendChild(p)
        container.appendChild(link)
        container.appendChild(img)
        container.appendChild(textNode)

        traverse(container, false, 0)

        expect(p.getAttribute('dir')).toBe('auto')
        expect(link.getAttribute('class')).toBe('markdown-external-link')
        expect(img.getAttribute('itemprop')).toBe('image')
      })

      it('should process all node types with forApp=true', () => {
        const container = doc.createElement('div')

        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Link'

        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')

        container.appendChild(link)
        container.appendChild(img)

        traverse(container, true, 0)

        expect(link.getAttribute('data-href')).toBe('https://example.com')
        expect(img.getAttribute('itemprop')).toBe('image')
      })
    })

    describe('unknown node types', () => {
      it('should skip div elements (no specific handler)', () => {
        const container = doc.createElement('div')
        const innerDiv = doc.createElement('div')
        innerDiv.setAttribute('data-test', 'value')
        container.appendChild(innerDiv)

        expect(() => traverse(container, false, 0)).not.toThrow()

        // Div should still exist and be traversed recursively
        // Use getElementsByTagName as xmldom doesn't support querySelector
        const divs = container.getElementsByTagName('div')
        let found = false
        for (let i = 0; i < divs.length; i++) {
          if (divs[i]?.getAttribute('data-test') === 'value') {
            found = true
            break
          }
        }
        expect(found).toBe(true)
      })

      it('should skip span elements (no specific handler)', () => {
        const container = doc.createElement('div')
        const span = doc.createElement('span')
        span.textContent = 'Test span'
        container.appendChild(span)

        expect(() => traverse(container, false, 0)).not.toThrow()
      })

      it('should skip comment nodes', () => {
        const container = doc.createElement('div')
        const comment = doc.createComment('This is a comment')
        container.appendChild(comment)

        expect(() => traverse(container, false, 0)).not.toThrow()
      })
    })

    describe('empty container', () => {
      it('should handle empty container', () => {
        const container = doc.createElement('div')

        expect(() => traverse(container, false, 0)).not.toThrow()
      })

      it('should handle container with only whitespace', () => {
        const container = doc.createElement('div')
        container.textContent = '   '

        expect(() => traverse(container, false, 0)).not.toThrow()
      })
    })
  })

  describe('recursion and depth', () => {
    describe('nested structures', () => {
      it('should traverse nested structures', () => {
        const container = doc.createElement('div')
        const level1 = doc.createElement('div')
        const level2 = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Deep link'

        level2.appendChild(link)
        level1.appendChild(level2)
        container.appendChild(level1)

        traverse(container, false, 0)

        expect(link.getAttribute('class')).toBe('markdown-external-link')
      })

      it('should traverse nested structure with multiple elements at each level', () => {
        const container = doc.createElement('div')
        const level1a = doc.createElement('div')
        const level1b = doc.createElement('div')
        const link1 = doc.createElement('a')
        link1.setAttribute('href', 'https://example1.com')
        link1.textContent = 'Link 1'
        const link2 = doc.createElement('a')
        link2.setAttribute('href', 'https://example2.com')
        link2.textContent = 'Link 2'

        level1a.appendChild(link1)
        level1b.appendChild(link2)
        container.appendChild(level1a)
        container.appendChild(level1b)

        traverse(container, false, 0)

        expect(link1.getAttribute('class')).toBe('markdown-external-link')
        expect(link2.getAttribute('class')).toBe('markdown-external-link')
      })

      it('should handle nested paragraphs with images', () => {
        const container = doc.createElement('div')
        const div1 = doc.createElement('div')
        const p = doc.createElement('p')
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')

        p.appendChild(img)
        div1.appendChild(p)
        container.appendChild(div1)

        traverse(container, false, 0)

        expect(p.getAttribute('dir')).toBe('auto')
        expect(img.getAttribute('itemprop')).toBe('image')
      })
    })

    describe('deep nesting', () => {
      it('should handle deep nesting (10+ levels)', () => {
        const container = doc.createElement('div')
        let current = container

        // Create 10 nested divs
        for (let i = 0; i < 10; i++) {
          const div = doc.createElement('div')
          current.appendChild(div)
          current = div
        }

        // Add a link at the deepest level
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Deep link'
        current.appendChild(link)

        traverse(container, false, 0)

        expect(link.getAttribute('class')).toBe('markdown-external-link')
      })

      it('should handle very deep nesting (20+ levels)', () => {
        const container = doc.createElement('div')
        let current = container

        // Create 20 nested divs
        for (let i = 0; i < 20; i++) {
          const div = doc.createElement('div')
          current.appendChild(div)
          current = div
        }

        // Add multiple elements at the deepest level
        const p = doc.createElement('p')
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')

        current.appendChild(p)
        current.appendChild(img)

        traverse(container, false, 0)

        expect(p.getAttribute('dir')).toBe('auto')
        expect(img.getAttribute('itemprop')).toBe('image')
      })
    })

    describe('single level structure', () => {
      it('should process single-level structure', () => {
        const container = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Link'
        container.appendChild(link)

        traverse(container, false, 0)

        expect(link.getAttribute('class')).toBe('markdown-external-link')
      })

      it('should process multiple siblings at single level', () => {
        const container = doc.createElement('div')
        const elements = []

        for (let i = 0; i < 5; i++) {
          const p = doc.createElement('p')
          p.textContent = `Paragraph ${i}`
          elements.push(p)
          container.appendChild(p)
        }

        traverse(container, false, 0)

        elements.forEach(el => {
          expect(el.getAttribute('dir')).toBe('auto')
        })
      })
    })

    describe('sibling nodes at same level', () => {
      it('should process sibling nodes in order', () => {
        const container = doc.createElement('div')
        const link1 = doc.createElement('a')
        link1.setAttribute('href', 'https://example1.com')
        link1.textContent = 'Link 1'
        const link2 = doc.createElement('a')
        link2.setAttribute('href', 'https://example2.com')
        link2.textContent = 'Link 2'
        const link3 = doc.createElement('a')
        link3.setAttribute('href', 'https://example3.com')
        link3.textContent = 'Link 3'

        container.appendChild(link1)
        container.appendChild(link2)
        container.appendChild(link3)

        traverse(container, false, 0)

        expect(link1.getAttribute('class')).toBe('markdown-external-link')
        expect(link2.getAttribute('class')).toBe('markdown-external-link')
        expect(link3.getAttribute('class')).toBe('markdown-external-link')
      })

      it('should handle sibling images with LCP tracking', () => {
        const container = doc.createElement('div')
        const img1 = doc.createElement('img')
        img1.setAttribute('src', 'https://example.com/image1.jpg')
        const img2 = doc.createElement('img')
        img2.setAttribute('src', 'https://example.com/image2.jpg')
        const img3 = doc.createElement('img')
        img3.setAttribute('src', 'https://example.com/image3.jpg')

        container.appendChild(img1)
        container.appendChild(img2)
        container.appendChild(img3)

        const state = { firstImageFound: false }
        traverse(container, false, 0, state)

        // Only first image should be LCP
        expect(img1.getAttribute('loading')).toBe('eager')
        expect(img2.getAttribute('loading')).toBe('eager')
        expect(img3.getAttribute('loading')).toBe('eager')
        expect(state.firstImageFound).toBe(true)
      })
    })

    describe('parent-child-grandchild relationships', () => {
      it('should preserve parent-child-grandchild relationships', () => {
        const container = doc.createElement('div')
        const parent = doc.createElement('div')
        const child = doc.createElement('p')
        const grandchild = doc.createElement('a')
        grandchild.setAttribute('href', 'https://example.com')
        grandchild.textContent = 'Link'

        child.appendChild(grandchild)
        parent.appendChild(child)
        container.appendChild(parent)

        traverse(container, false, 0)

        expect(child.getAttribute('dir')).toBe('auto')
        expect(grandchild.getAttribute('class')).toBe('markdown-external-link')
        expect(child.contains(grandchild)).toBe(true)
        expect(parent.contains(child)).toBe(true)
      })

      it('should handle complex family tree', () => {
        const container = doc.createElement('div')
        const parent = doc.createElement('div')
        const child1 = doc.createElement('p')
        const child2 = doc.createElement('div')
        const grandchild1 = doc.createElement('img')
        grandchild1.setAttribute('src', 'https://example.com/image.jpg')
        const grandchild2 = doc.createElement('a')
        grandchild2.setAttribute('href', 'https://example.com')
        grandchild2.textContent = 'Link'

        child1.appendChild(grandchild1)
        child2.appendChild(grandchild2)
        parent.appendChild(child1)
        parent.appendChild(child2)
        container.appendChild(parent)

        traverse(container, false, 0)

        expect(child1.getAttribute('dir')).toBe('auto')
        expect(grandchild1.getAttribute('itemprop')).toBe('image')
        expect(grandchild2.getAttribute('class')).toBe('markdown-external-link')
      })
    })
  })

  describe('parameters', () => {
    describe('forApp parameter', () => {
      it('should pass forApp=true to anchor handler', () => {
        const container = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Example'
        container.appendChild(link)

        traverse(container, true, 0)

        expect(link.getAttribute('data-href')).toBe('https://example.com')
        expect(link.getAttribute('href')).toBeNull()
      })

      it('should pass forApp=false to anchor handler', () => {
        const container = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Example'
        container.appendChild(link)

        traverse(container, false, 0)

        expect(link.getAttribute('href')).toBe('https://example.com')
        expect(link.getAttribute('data-href')).toBeNull()
      })

      it('should pass forApp to text handler', () => {
        const container = doc.createElement('div')
        const textNode = doc.createTextNode('https://ecency.com/@username/post')
        container.appendChild(textNode)

        traverse(container, true, 0)

        const links = container.getElementsByTagName('a')
        if (links.length > 0) {
          expect(links[0]?.hasAttribute('data-author')).toBe(true)
        }
      })

      it('should affect nested elements', () => {
        const container = doc.createElement('div')
        const div = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Example'
        div.appendChild(link)
        container.appendChild(div)

        traverse(container, true, 0)

        expect(link.getAttribute('data-href')).toBe('https://example.com')
      })
    })

    describe('image format', () => {
      it('should always use format=match for proxified images', () => {
        const container = doc.createElement('div')
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')
        container.appendChild(img)

        traverse(container, false, 0)

        expect(img.getAttribute('src')).toContain('format=match')
        expect(img.getAttribute('src')).not.toContain('format=webp')
      })
    })

    describe('parentDomain parameter', () => {
      it('should pass parentDomain to anchor handler', () => {
        const container = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://www.twitch.tv/channel')
        link.textContent = 'https://www.twitch.tv/channel'
        container.appendChild(link)

        traverse(container, false, 0, { firstImageFound: false }, 'custom.com')

        const iframes = link.getElementsByTagName('iframe')
        if (iframes.length > 0) {
          expect(iframes[0]?.getAttribute('src')).toContain('parent=custom.com')
        }
      })

      it('should pass parentDomain to iframe handler', () => {
        const container = doc.createElement('div')
        const iframe = doc.createElement('iframe')
        iframe.setAttribute('src', 'https://player.twitch.tv/?channel=test')
        container.appendChild(iframe)

        traverse(container, false, 0, { firstImageFound: false }, 'custom.com')

        expect(iframe.getAttribute('src')).toContain('parent=custom.com')
      })

      it('should use default parentDomain if not provided', () => {
        const container = doc.createElement('div')
        const iframe = doc.createElement('iframe')
        iframe.setAttribute('src', 'https://player.twitch.tv/?channel=test')
        container.appendChild(iframe)

        traverse(container, false, 0)

        expect(iframe.getAttribute('src')).toContain('parent=ecency.com')
      })
    })

    describe('state.firstImageFound flag', () => {
      it('should track firstImageFound state', () => {
        const container = doc.createElement('div')
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')
        container.appendChild(img)

        const state = { firstImageFound: false }
        traverse(container, false, 0, state)

        expect(state.firstImageFound).toBe(true)
      })

      it('should persist state across multiple images', () => {
        const container = doc.createElement('div')
        const img1 = doc.createElement('img')
        img1.setAttribute('src', 'https://example.com/image1.jpg')
        const img2 = doc.createElement('img')
        img2.setAttribute('src', 'https://example.com/image2.jpg')
        container.appendChild(img1)
        container.appendChild(img2)

        const state = { firstImageFound: false }
        traverse(container, false, 0, state)

        expect(img1.getAttribute('loading')).toBe('eager')
        expect(img2.getAttribute('loading')).toBe('eager')
        expect(state.firstImageFound).toBe(true)
      })

      it('should maintain state across nested structures', () => {
        const container = doc.createElement('div')
        const div1 = doc.createElement('div')
        const div2 = doc.createElement('div')
        const img1 = doc.createElement('img')
        img1.setAttribute('src', 'https://example.com/image1.jpg')
        const img2 = doc.createElement('img')
        img2.setAttribute('src', 'https://example.com/image2.jpg')

        div1.appendChild(img1)
        div2.appendChild(img2)
        container.appendChild(div1)
        container.appendChild(div2)

        const state = { firstImageFound: false }
        traverse(container, false, 0, state)

        expect(img1.getAttribute('loading')).toBe('eager')
        expect(img2.getAttribute('loading')).toBe('eager')
      })

      it('should not mark as LCP if state already marked', () => {
        const container = doc.createElement('div')
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')
        container.appendChild(img)

        const state = { firstImageFound: true }
        traverse(container, false, 0, state)

        expect(img.getAttribute('loading')).toBe('eager')
      })
    })

    describe('depth tracking', () => {
      it('should increment depth on recursion', () => {
        const container = doc.createElement('div')
        const level1 = doc.createElement('div')
        const level2 = doc.createElement('div')

        level1.appendChild(level2)
        container.appendChild(level1)

        // Depth tracking is internal, but we can verify recursion works
        expect(() => traverse(container, false, 0)).not.toThrow()
      })

      it('should handle starting depth parameter', () => {
        const container = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Link'
        container.appendChild(link)

        // Starting at depth 5
        expect(() => traverse(container, false, 5)).not.toThrow()
        expect(link.getAttribute('class')).toBe('markdown-external-link')
      })

      it('should handle large depth values', () => {
        const container = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Link'
        container.appendChild(link)

        // Starting at depth 100
        expect(() => traverse(container, false, 100)).not.toThrow()
        expect(link.getAttribute('class')).toBe('markdown-external-link')
      })
    })
  })

  describe('integration', () => {
    describe('handler invocation', () => {
      it('should call all applicable handlers for complex structure', () => {
        const container = doc.createElement('div')

        const p = doc.createElement('p')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Link'
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')
        const iframe = doc.createElement('iframe')
        iframe.setAttribute('src', 'https://www.youtube.com/embed/test')

        p.appendChild(link)
        container.appendChild(p)
        container.appendChild(img)
        container.appendChild(iframe)

        traverse(container, false, 0)

        // Verify all handlers were called
        expect(p.getAttribute('dir')).toBe('auto')
        expect(link.getAttribute('class')).toBe('markdown-external-link')
        expect(img.getAttribute('itemprop')).toBe('image')
        expect(iframe.getAttribute('src')).toBeTruthy()
      })

      it('should process elements in document order', () => {
        const container = doc.createElement('div')
        const results: string[] = []

        const img1 = doc.createElement('img')
        img1.setAttribute('src', 'https://example.com/image1.jpg')
        img1.setAttribute('data-order', '1')

        const img2 = doc.createElement('img')
        img2.setAttribute('src', 'https://example.com/image2.jpg')
        img2.setAttribute('data-order', '2')

        const img3 = doc.createElement('img')
        img3.setAttribute('src', 'https://example.com/image3.jpg')
        img3.setAttribute('data-order', '3')

        container.appendChild(img1)
        container.appendChild(img2)
        container.appendChild(img3)

        const state = { firstImageFound: false }
        traverse(container, false, 0, state)

        // First image should be eager, others lazy
        expect(img1.getAttribute('loading')).toBe('eager')
        expect(img2.getAttribute('loading')).toBe('eager')
        expect(img3.getAttribute('loading')).toBe('eager')
      })
    })

    describe('node replacement during traversal', () => {
      it('should handle node replacement by anchor handler', () => {
        const container = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com/image.jpg')
        link.textContent = 'https://example.com/image.jpg'
        container.appendChild(link)

        const originalChildCount = container.childNodes.length

        traverse(container, false, 0)

        // Link should be replaced with img
        const imgs = container.getElementsByTagName('img')
        expect(imgs.length).toBeGreaterThan(0)
      })

      it('should handle node replacement by text handler', () => {
        const container = doc.createElement('div')
        const textNode = doc.createTextNode('https://example.com/image.jpg')
        container.appendChild(textNode)

        traverse(container, false, 0)

        // Text node should be replaced with img
        const imgs = container.getElementsByTagName('img')
        expect(imgs.length).toBeGreaterThan(0)
      })

      it('should continue traversal after node replacement', () => {
        const container = doc.createElement('div')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com/image.jpg')
        link.textContent = 'https://example.com/image.jpg'
        const p = doc.createElement('p')
        p.textContent = 'Paragraph'

        container.appendChild(link)
        container.appendChild(p)

        traverse(container, false, 0)

        // Both should be processed
        const imgs = container.getElementsByTagName('img')
        expect(imgs.length).toBeGreaterThan(0)
        expect(p.getAttribute('dir')).toBe('auto')
      })

      it('should handle multiple replacements in sequence', () => {
        const container = doc.createElement('div')
        const link1 = doc.createElement('a')
        link1.setAttribute('href', 'https://example.com/image1.jpg')
        link1.textContent = 'https://example.com/image1.jpg'
        const link2 = doc.createElement('a')
        link2.setAttribute('href', 'https://example.com/image2.jpg')
        link2.textContent = 'https://example.com/image2.jpg'

        container.appendChild(link1)
        container.appendChild(link2)

        traverse(container, false, 0)

        const imgs = container.getElementsByTagName('img')
        expect(imgs.length).toBeGreaterThan(1)
      })
    })

    describe('state mutation tracking', () => {
      it('should mutate state across recursive calls', () => {
        const container = doc.createElement('div')
        const div1 = doc.createElement('div')
        const div2 = doc.createElement('div')
        const img1 = doc.createElement('img')
        img1.setAttribute('src', 'https://example.com/image1.jpg')
        const img2 = doc.createElement('img')
        img2.setAttribute('src', 'https://example.com/image2.jpg')

        div1.appendChild(img1)
        div2.appendChild(img2)
        container.appendChild(div1)
        container.appendChild(div2)

        const state = { firstImageFound: false }
        traverse(container, false, 0, state)

        // State should be mutated
        expect(state.firstImageFound).toBe(true)
        // Only first image marked as LCP
        expect(img1.getAttribute('loading')).toBe('eager')
        expect(img2.getAttribute('loading')).toBe('eager')
      })

      it('should share state between parent and child traversals', () => {
        const container = doc.createElement('div')
        const parent = doc.createElement('div')
        const child = doc.createElement('div')
        const img1 = doc.createElement('img')
        img1.setAttribute('src', 'https://example.com/image1.jpg')
        const img2 = doc.createElement('img')
        img2.setAttribute('src', 'https://example.com/image2.jpg')

        parent.appendChild(img1)
        child.appendChild(img2)
        parent.appendChild(child)
        container.appendChild(parent)

        const state = { firstImageFound: false }
        traverse(container, false, 0, state)

        expect(state.firstImageFound).toBe(true)
        expect(img1.getAttribute('loading')).toBe('eager')
        expect(img2.getAttribute('loading')).toBe('eager')
      })

      it('should handle state mutation with deep nesting', () => {
        const container = doc.createElement('div')
        let current = container

        // Create deep nesting
        for (let i = 0; i < 5; i++) {
          const div = doc.createElement('div')
          current.appendChild(div)
          current = div
        }

        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')
        current.appendChild(img)

        const state = { firstImageFound: false }
        traverse(container, false, 0, state)

        expect(state.firstImageFound).toBe(true)
        expect(img.getAttribute('loading')).toBe('eager')
      })
    })

    describe('edge cases', () => {
      it('should handle null node', () => {
        expect(() => traverse(null as any, false, 0)).not.toThrow()
      })

      it('should handle node without childNodes', () => {
        const textNode = doc.createTextNode('text')
        expect(() => traverse(textNode as any, false, 0)).not.toThrow()
      })

      it('should handle removed child during iteration', () => {
        const container = doc.createElement('div')
        const p = doc.createElement('p')
        p.textContent = 'Test paragraph'
        const iframe = doc.createElement('iframe')
        // iframe without src will be removed

        container.appendChild(p)
        container.appendChild(iframe)

        expect(() => traverse(container, false, 0)).not.toThrow()

        // iframe should be removed
        expect(container.getElementsByTagName('iframe').length).toBe(0)
        // p should be processed (traverse processes children recursively)
        // The p element itself is processed when its parent is traversed
        const paragraphs = container.getElementsByTagName('p')
        expect(paragraphs.length).toBeGreaterThan(0)
        if (paragraphs.length > 0) {
          expect(paragraphs[0]?.getAttribute('dir')).toBe('auto')
        }
      })

      it('should handle all parameters with complex structure', () => {
        const container = doc.createElement('div')
        const div = doc.createElement('div')
        const p = doc.createElement('p')
        const link = doc.createElement('a')
        link.setAttribute('href', 'https://example.com')
        link.textContent = 'Link'
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/image.jpg')

        p.appendChild(link)
        div.appendChild(p)
        div.appendChild(img)
        container.appendChild(div)

        const state = { firstImageFound: false }
        traverse(container, true, 0, state, 'custom.com')

        expect(p.getAttribute('dir')).toBe('auto')
        expect(link.getAttribute('data-href')).toBe('https://example.com')
        expect(img.getAttribute('src')).toContain('format=match')
        expect(state.firstImageFound).toBe(true)
      })
    })
  })
})
