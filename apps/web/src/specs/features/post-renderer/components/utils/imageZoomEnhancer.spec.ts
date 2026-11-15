import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applyImageZoom } from '@/features/post-renderer/components/utils/imageZoomEnhancer'
import mediumZoom from 'medium-zoom'

// Mock medium-zoom
vi.mock('medium-zoom', () => ({
  default: vi.fn(() => ({
    update: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
  })),
}))

describe('applyImageZoom', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    container.classList.add('markdown-view')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('image caption wrapping', () => {
    it('should wrap images with title in container', () => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      img.title = 'Test Caption'
      container.appendChild(img)

      // Pass the body as parent container since selector looks for .markdown-view img
      applyImageZoom(document.body)

      const wrapper = container.querySelector('.markdown-image-container')
      expect(wrapper).toBeTruthy()
      const caption = wrapper?.querySelector('.markdown-img-caption')
      expect(caption?.innerText).toBe('Test Caption')
    })

    it('should use data-caption attribute', () => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      img.setAttribute('data-caption', 'Data Caption')
      container.appendChild(img)

      applyImageZoom(document.body)

      const caption = container.querySelector('.markdown-img-caption')
      expect(caption?.innerText).toBe('Data Caption')
    })

    it('should use alt text if not a filename', () => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      img.alt = 'Beautiful landscape'
      container.appendChild(img)

      applyImageZoom(document.body)

      const caption = container.querySelector('.markdown-img-caption')
      expect(caption?.innerText).toBe('Beautiful landscape')
    })

    it('should skip alt text if it looks like a filename', () => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      img.alt = 'image-123.jpg'
      container.appendChild(img)

      applyImageZoom(document.body)

      const caption = container.querySelector('.markdown-img-caption')
      expect(caption).toBeNull()
    })

    it('should skip alt text if it is a generic placeholder', () => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      img.alt = 'Alt'
      container.appendChild(img)

      applyImageZoom(document.body)

      const caption = container.querySelector('.markdown-img-caption')
      expect(caption).toBeNull()
    })

    it('should prioritize title over data-caption', () => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      img.title = 'Title Caption'
      img.setAttribute('data-caption', 'Data Caption')
      container.appendChild(img)

      applyImageZoom(document.body)

      const caption = container.querySelector('.markdown-img-caption')
      expect(caption?.innerText).toBe('Title Caption')
    })

    it('should prioritize data-caption over alt', () => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      img.setAttribute('data-caption', 'Data Caption')
      img.alt = 'Alt Text'
      container.appendChild(img)

      applyImageZoom(document.body)

      const caption = container.querySelector('.markdown-img-caption')
      expect(caption?.innerText).toBe('Data Caption')
    })

    it('should wrap image without caption', () => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      container.appendChild(img)

      applyImageZoom(document.body)

      const wrapper = container.querySelector('.markdown-image-container')
      expect(wrapper).toBeTruthy()
      const caption = wrapper?.querySelector('.markdown-img-caption')
      expect(caption).toBeNull()
    })
  })

  describe('filtering logic', () => {
    it('should skip images inside anchor tags', () => {
      const anchor = document.createElement('a')
      anchor.href = 'test.jpg'
      const img = document.createElement('img')
      img.src = 'test.jpg'
      anchor.appendChild(img)
      container.appendChild(anchor)

      applyImageZoom(document.body)

      const wrapper = container.querySelector('.markdown-image-container')
      expect(wrapper).toBeNull()
    })

    it('should skip images already wrapped', () => {
      const wrapper = document.createElement('div')
      wrapper.classList.add('markdown-image-container')
      const img = document.createElement('img')
      img.src = 'test.jpg'
      wrapper.appendChild(img)
      container.appendChild(wrapper)

      applyImageZoom(document.body)

      // Should not create nested wrappers
      const wrappers = container.querySelectorAll('.markdown-image-container')
      expect(wrappers.length).toBe(1)
    })

    it('should skip images with medium-zoom-image class', () => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      img.classList.add('medium-zoom-image')
      container.appendChild(img)

      applyImageZoom(document.body)

      // Should not wrap already zoomed images
      const wrapper = img.closest('.markdown-image-container')
      expect(wrapper).toBeNull()
    })

    it('should skip images in markdown-view-pure', () => {
      container.classList.add('markdown-view-pure')
      const img = document.createElement('img')
      img.src = 'test.jpg'
      container.appendChild(img)

      applyImageZoom(document.body)

      const wrapper = container.querySelector('.markdown-image-container')
      expect(wrapper).toBeNull()
    })
  })

  describe('multiple images', () => {
    it('should process multiple images', () => {
      const img1 = document.createElement('img')
      img1.src = 'test1.jpg'
      img1.title = 'Image 1'

      const img2 = document.createElement('img')
      img2.src = 'test2.jpg'
      img2.title = 'Image 2'

      container.appendChild(img1)
      container.appendChild(img2)

      applyImageZoom(document.body)

      const wrappers = container.querySelectorAll('.markdown-image-container')
      expect(wrappers.length).toBe(2)
    })

    it('should handle mix of images with and without captions', () => {
      const img1 = document.createElement('img')
      img1.src = 'test1.jpg'
      img1.title = 'Has caption'

      const img2 = document.createElement('img')
      img2.src = 'test2.jpg'

      container.appendChild(img1)
      container.appendChild(img2)

      applyImageZoom(document.body)

      const captions = container.querySelectorAll('.markdown-img-caption')
      expect(captions.length).toBe(1)
      expect(captions[0].innerText).toBe('Has caption')
    })
  })

  describe('edge cases', () => {
    it('should handle empty container', () => {
      expect(() => applyImageZoom(container)).not.toThrow()
    })

    it('should handle container with no images', () => {
      container.innerHTML = '<div>Some text</div>'
      expect(() => applyImageZoom(container)).not.toThrow()
    })

    it('should handle disconnected images gracefully', () => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      // Don't append to container

      // Create a spy container with the disconnected image
      const mockContainer = {
        querySelectorAll: vi.fn(() => [img]),
      } as any

      expect(() => applyImageZoom(mockContainer)).not.toThrow()
    })
  })

  describe('filename detection', () => {
    it.each([
      ['image.jpg', true],
      ['photo.jpeg', true],
      ['picture.png', true],
      ['animation.gif', true],
      ['graphic.webp', true],
      ['bitmap.bmp', true],
      ['vector.svg', true],
      ['my-photo-2023.jpg', true],
      ['Beautiful landscape', false],
      ['A photo of sunset', false],
      ['', false],
    ])('should detect "%s" as filename: %s', (alt, isFilename) => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      img.alt = alt
      container.appendChild(img)

      applyImageZoom(document.body)

      const caption = container.querySelector('.markdown-img-caption')
      if (isFilename) {
        expect(caption).toBeNull()
      } else if (alt) {
        expect(caption?.innerText).toBe(alt)
      } else {
        expect(caption).toBeNull()
      }
    })
  })

  describe('alignment preservation', () => {
    it('should center images inside <center> tags', () => {
      const center = document.createElement('center')
      const img = document.createElement('img')
      img.src = 'test.jpg'
      center.appendChild(img)
      container.appendChild(center)

      applyImageZoom(document.body)

      const wrapper = container.querySelector('.markdown-image-container') as HTMLElement
      expect(wrapper).toBeTruthy()
      expect(wrapper.style.textAlign).toBe('center')
    })

    it('should preserve right alignment from parent', () => {
      const p = document.createElement('p')
      p.setAttribute('dir', 'right')
      const img = document.createElement('img')
      img.src = 'test.jpg'
      p.appendChild(img)
      container.appendChild(p)

      applyImageZoom(document.body)

      const wrapper = container.querySelector('.markdown-image-container') as HTMLElement
      expect(wrapper).toBeTruthy()
      expect(wrapper.style.textAlign).toBe('right')
    })

    it('should default to center when no alignment is specified', () => {
      const img = document.createElement('img')
      img.src = 'test.jpg'
      container.appendChild(img)

      applyImageZoom(document.body)

      const wrapper = container.querySelector('.markdown-image-container') as HTMLElement
      expect(wrapper).toBeTruthy()
      expect(wrapper.style.textAlign).toBe('center')
    })

    it('should not center when parent explicitly sets left alignment', () => {
      const p = document.createElement('p')
      p.setAttribute('dir', 'left')
      const img = document.createElement('img')
      img.src = 'test.jpg'
      p.appendChild(img)
      container.appendChild(p)

      applyImageZoom(document.body)

      const wrapper = container.querySelector('.markdown-image-container') as HTMLElement
      expect(wrapper).toBeTruthy()
      expect(wrapper.style.textAlign).toBe('')
    })
  })

  describe('<picture> content-negotiation (keep <img> a direct child of <picture>)', () => {
    function addPicture(): HTMLImageElement {
      const picture = document.createElement('picture')
      const avif = document.createElement('source')
      avif.setAttribute('type', 'image/avif')
      avif.setAttribute('srcset', 'https://i.ecency.com/p/abc?format=avif&mode=fit&width=320 320w')
      const webp = document.createElement('source')
      webp.setAttribute('type', 'image/webp')
      webp.setAttribute('srcset', 'https://i.ecency.com/p/abc?format=webp&mode=fit&width=320 320w')
      const img = document.createElement('img')
      img.src = 'https://i.ecency.com/p/abc?format=match&mode=fit'
      picture.appendChild(avif)
      picture.appendChild(webp)
      picture.appendChild(img)
      container.appendChild(picture)
      return img
    }

    it('wraps the whole <picture> and keeps <img> a DIRECT child of it (sources stay effective)', () => {
      addPicture()
      applyImageZoom(document.body)

      // The <picture> is moved into the caption container, NOT just the <img>.
      const wrapper = container.querySelector('.markdown-image-container') as HTMLElement
      expect(wrapper).toBeTruthy()
      const picture = wrapper.querySelector(':scope > picture') as HTMLElement
      expect(picture).toBeTruthy()
      // The <img> must remain a direct child of <picture> (else <source>s are ignored).
      const directImg = picture.querySelector(':scope > img')
      expect(directImg).toBeTruthy()
      // Both <source> renditions survive alongside the <img>.
      expect(picture.querySelectorAll('source').length).toBe(2)
      // The <img> is NOT directly under the container (which would orphan the sources).
      expect(wrapper.querySelector(':scope > img')).toBeNull()
    })

    it('does not zoom-wrap a <picture> whose <img> is inside an anchor', () => {
      const anchor = document.createElement('a')
      anchor.href = '/somewhere'
      const picture = document.createElement('picture')
      const img = document.createElement('img')
      img.src = 'https://i.ecency.com/p/abc?format=match&mode=fit'
      picture.appendChild(img)
      anchor.appendChild(picture)
      container.appendChild(anchor)

      applyImageZoom(document.body)

      // Linked images are excluded (the check looks through <picture> to the <a>).
      expect(container.querySelector('.markdown-image-container')).toBeNull()
    })
  })

  // medium-zoom adds document and window listeners per instance and detach()
  // does not remove them. The entry page runs setupPostEnhancements again on
  // every Edit History or raw toggle, so each run must reuse one instance and
  // its cleanup must release only its own images (#2083).
  describe('one medium-zoom instance across runs', () => {
    const run = async () => {
      const body = document.createElement('div')
      body.classList.add('markdown-view')
      const img = document.createElement('img')
      img.src = `https://images.ecency.com/${Math.random()}.png`
      body.appendChild(img)
      document.body.appendChild(body)
      const pending = applyImageZoom(body)
      // jsdom never loads images; the enhancer waits for load first.
      body.querySelectorAll('img').forEach((i) => i.dispatchEvent(new Event('load')))
      const handle = await pending
      return { handle, zoomed: body.querySelector('img')! }
    }

    it('creates at most one instance and attaches later runs to it', async () => {
      const before = vi.mocked(mediumZoom).mock.calls.length
      await run()
      const second = await run()
      const third = await run()
      expect(vi.mocked(mediumZoom).mock.calls.length - before).toBeLessThanOrEqual(1)
      const zoom = vi.mocked(mediumZoom).mock.results.at(-1)!.value

      expect(zoom.attach).toHaveBeenCalledWith(second.zoomed)
      expect(zoom.attach).toHaveBeenCalledWith(third.zoomed)

      // Cleanup releases this run's images only, not the other runs'.
      third.handle?.detach()
      expect(zoom.detach).toHaveBeenLastCalledWith(third.zoomed)
    })
  })
})
