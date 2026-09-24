import { iframe } from './iframe.method'
import { DOMParser } from '../consts'

// Helper to check if an element with class exists in childNodes
function hasChildWithClass(parent: any, className: string): boolean {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i]
    if (child.nodeType === 1 && child.getAttribute('class') === className) {
      return true
    }
  }
  return false
}

// Helper to check if an element with tag name exists in childNodes
function hasChildWithTag(parent: any, tagName: string): boolean {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i]
    if (child.nodeType === 1 && child.nodeName.toLowerCase() === tagName.toLowerCase()) {
      return true
    }
  }
  return false
}

// Helper to find child element with tag name
function findChildWithTag(parent: any, tagName: string): any {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i]
    if (child.nodeType === 1 && child.nodeName.toLowerCase() === tagName.toLowerCase()) {
      return child
    }
  }
  return null
}

// Helper to find child element with class
function findChildWithClass(parent: any, className: string): any {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i]
    if (child.nodeType === 1 && child.getAttribute('class') === className) {
      return child
    }
  }
  return null
}

// Helper to get text content recursively
function getTextContent(node: any): string {
  if (!node) return ''
  if (node.nodeType === 3) return node.data || '' // Text node
  if (node.nodeType === 1) { // Element node
    let text = ''
    for (let i = 0; i < node.childNodes.length; i++) {
      text += getTextContent(node.childNodes[i])
    }
    return text
  }
  return ''
}

describe('iframe() method - Iframe Sanitization', () => {
  let doc: Document

  beforeEach(() => {
    doc = DOMParser.parseFromString('<html><body></body></html>', 'text/html')
  })

  describe('Security Tests', () => {
    it('should remove iframe with no src attribute', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      parent.appendChild(el)

      iframe(el)

      expect(parent.childNodes.length).toBe(0)
    })

    it('should remove iframe with empty src attribute', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '')
      parent.appendChild(el)

      iframe(el)

      expect(parent.childNodes.length).toBe(0)
    })

    it('should replace unsupported iframe sources with placeholder', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://evil.com/malicious.html')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBeTruthy()
      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
      const text = getTextContent(parent)
      expect(text).toContain('Unsupported')
      expect(text).toContain('https://evil.com/malicious.html')
    })

    it('should block data: URIs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'data:text/html,<script>alert("XSS")</script>')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBeTruthy()
      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
    })

    it('should block javascript: URIs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'javascript:alert("XSS")')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBeTruthy()
      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
    })

    it('should block file: protocol URIs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'file:///etc/passwd')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBeTruthy()
      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
    })

    it('should block relative URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '/malicious/path')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBeTruthy()
      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
    })

    it('should block protocol-relative URLs from unknown domains', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '//evil.com/malicious.html')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBeTruthy()
      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
    })
  })

  describe('YouTube Iframes', () => {
    it('should allow YouTube embed and strip query parameters', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&controls=0')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('should handle YouTube embed without query parameters', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('should handle YouTube shorts embeds', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.youtube.com/shorts/abc123?param=value')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('src')).toBe('https://www.youtube.com/shorts/abc123')
      // #1271: no wrapper anchor, so the iframe itself carries the 9:16 marker
      expect(el.getAttribute('class')).toBe('portrait-embed')
    })

    it('should not mark a regular YouTube embed portrait', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ')
      parent.appendChild(el)

      iframe(el)

      expect(el.hasAttribute('class')).toBe(false)
    })

    it('should handle YouTube embed with protocol-relative URL', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '//www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('src')).toBe('//www.youtube.com/embed/dQw4w9WgXcQ')
    })
  })

  describe('Vimeo Iframes', () => {
    it('should normalize Vimeo player URL', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://player.vimeo.com/video/123456789')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('src')).toBe('https://player.vimeo.com/video/123456789')
    })

    it('should normalize Vimeo player URL with query parameters', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://player.vimeo.com/video/123456789?autoplay=1')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('src')).toBe('https://player.vimeo.com/video/123456789')
    })

    it('should normalize Vimeo player URL with hash', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://player.vimeo.com/video/123456789#t=30s')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('src')).toBe('https://player.vimeo.com/video/123456789')
    })
  })

  describe('Twitch Iframes', () => {
    it('should add parent domain parameter to Twitch iframe', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://player.twitch.tv/?channel=channel123')
      parent.appendChild(el)

      iframe(el, 'example.com')

      const src = el.getAttribute('src')
      expect(src).toContain('parent=example.com')
      expect(src).toContain('autoplay=false')
    })

    it('should add parent and autoplay to Twitch iframe without query params', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://player.twitch.tv/')
      parent.appendChild(el)

      iframe(el, 'ecency.com')

      const src = el.getAttribute('src')
      expect(src).toContain('?parent=ecency.com')
      expect(src).toContain('&autoplay=false')
    })

    it('should not duplicate parent parameter if already present', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://player.twitch.tv/?parent=ecency.com')
      parent.appendChild(el)

      iframe(el, 'example.com')

      const src = el.getAttribute('src')!
      const parentMatches = src.match(/parent=/g)
      expect(parentMatches).toHaveLength(1)
      expect(src).toContain('parent=ecency.com')
    })

    it('should not duplicate autoplay parameter if already present', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://player.twitch.tv/?autoplay=true')
      parent.appendChild(el)

      iframe(el, 'ecency.com')

      const src = el.getAttribute('src')!
      const autoplayMatches = src.match(/autoplay=/g)
      expect(autoplayMatches).toHaveLength(1)
      expect(src).toContain('autoplay=true')
    })

    it('should handle existing query parameters correctly', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://player.twitch.tv/?video=12345')
      parent.appendChild(el)

      iframe(el, 'ecency.com')

      const src = el.getAttribute('src')!
      expect(src).toContain('video=12345')
      expect(src).toContain('&parent=ecency.com')
      expect(src).toContain('&autoplay=false')
    })

    it('should use default parent domain if not provided', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://player.twitch.tv/?channel=test')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')
      expect(src).toContain('parent=ecency.com')
    })

    it('should handle protocol-relative Twitch URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '//player.twitch.tv/?channel=test')
      parent.appendChild(el)

      iframe(el, 'example.com')

      const src = el.getAttribute('src')
      expect(src).toContain('parent=example.com')
      expect(src).toContain('autoplay=false')
    })
  })

  describe('3Speak Iframes', () => {
    it('should normalize 3speak.co domain to play.3speak.tv', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://3speak.co/embed?v=video123')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('src')).toContain('play.3speak.tv')
      expect(el.getAttribute('src')).not.toContain('3speak.co')
      expect(el.getAttribute('src')).toContain('mode=iframe')
      expect(el.getAttribute('src')).toContain('autoplay=true')
    })

    it('should normalize 3speak.online domain to play.3speak.tv', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://3speak.online/embed?v=video123')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('src')).toContain('play.3speak.tv')
      expect(el.getAttribute('src')).not.toContain('3speak.online')
      expect(el.getAttribute('src')).toContain('mode=iframe')
      expect(el.getAttribute('src')).toContain('autoplay=true')
    })

    it('should not add autoplay if already present', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://3speak.tv/embed?v=video123&autoplay=false')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      const autoplayMatches = src.match(/autoplay=/g)
      expect(autoplayMatches).toHaveLength(1)
      expect(src).toContain('autoplay=false')
    })

    it('should default to autoplay=false in waves (embedVideosDirectly)', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://3speak.co/embed?v=video123')
      parent.appendChild(el)

      iframe(el, 'ecency.com', false, { embedVideosDirectly: true })

      const src = el.getAttribute('src')!
      expect(src).toContain('play.3speak.tv')
      expect(src).toContain('mode=iframe')
      expect(src).toContain('autoplay=false')
      expect(src).not.toContain('autoplay=true')
    })

    it('should override a baked-in autoplay=true in waves (embedVideosDirectly)', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://3speak.co/embed?v=video123&autoplay=true')
      parent.appendChild(el)

      iframe(el, 'ecency.com', false, { embedVideosDirectly: true })

      const src = el.getAttribute('src')!
      expect(src).toContain('play.3speak.tv')
      expect(src).toContain('autoplay=false')
      expect(src).not.toContain('autoplay=true')
      // still exactly one autoplay param, just flipped to false
      expect(src.match(/autoplay=/g)).toHaveLength(1)
    })

    it('should handle 3speak URLs with multiple query parameters', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://3speak.co/embed?v=video123&muted=1')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      expect(src).toContain('play.3speak.tv')
      expect(src).toContain('v=video123')
      expect(src).toContain('mode=iframe')
      expect(src).toContain('muted=1')
      expect(src).toContain('autoplay=true')
    })

    it('should handle protocol-relative 3speak URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '//3speak.co/embed?v=video123')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('src')).toContain('play.3speak.tv')
      expect(el.getAttribute('src')).toContain('mode=iframe')
    })

    it('should not double-prefix play. on already-correct play.3speak.tv URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://play.3speak.tv/embed?v=user/video123')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      expect(src).toContain('play.3speak.tv')
      expect(src).not.toContain('play.play.3speak.tv')
    })

    it('should normalize /embed? to /watch? in 3speak URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://3speak.tv/embed?v=user/video123&mode=iframe')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      expect(src).toContain('/watch?v=')
      expect(src).not.toContain('/embed?')
      expect(src).toContain('play.3speak.tv')
    })

    it('should set speak-iframe class on 3speak iframes', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://3speak.co/embed?v=video123')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('class')).toBe('speak-iframe')
    })

    it('should add layout=mobile when forApp is true', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://3speak.co/embed?v=video123')
      parent.appendChild(el)

      iframe(el, 'ecency.com', true)

      expect(el.getAttribute('src')).toContain('&layout=mobile')
    })

    it('should not add layout=mobile when forApp is false', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://3speak.co/embed?v=video123')
      parent.appendChild(el)

      iframe(el, 'ecency.com', false)

      expect(el.getAttribute('src')).not.toContain('layout=mobile')
    })

    it('should not duplicate layout param if already present', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://3speak.co/embed?v=video123&layout=mobile')
      parent.appendChild(el)

      iframe(el, 'ecency.com', true)

      const src = el.getAttribute('src')!
      const matches = src.match(/layout=/g)
      expect(matches).toHaveLength(1)
    })
  })

  describe('Spotify Iframes', () => {
    it('should add sandbox attributes to Spotify embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://open.spotify.com/embed/playlist/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
      expect(el.getAttribute('frameborder')).toBe('0')
    })

    it('should handle Spotify podcast embeds', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://open.spotify.com/embed-podcast/show/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
      expect(el.getAttribute('frameborder')).toBe('0')
    })

    it('should handle Spotify episode embeds', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://open.spotify.com/embed/episode/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
    })

    it('should handle Spotify track embeds', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://open.spotify.com/embed/track/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
    })

    it('should handle Spotify album embeds', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://open.spotify.com/embed/album/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
    })
  })

  describe('SoundCloud Iframes', () => {
    it('should extract url parameter and construct proper SoundCloud player URL', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fuser%2Ftrack')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      expect(src).toContain('https://w.soundcloud.com/player/')
      expect(src).toContain('url=https%3A%2F%2Fsoundcloud.com%2Fuser%2Ftrack')
      expect(src).toContain('auto_play=false')
      expect(src).toContain('hide_related=false')
      expect(src).toContain('show_comments=true')
      expect(src).toContain('show_user=true')
      expect(src).toContain('show_reposts=false')
      expect(src).toContain('visual=true')
    })

    it('should handle SoundCloud URL with multiple parameters', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fuser%2Ftrack&color=ff5500')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      expect(src).toContain('url=https%3A%2F%2Fsoundcloud.com%2Fuser%2Ftrack')
    })

    it('should handle SoundCloud URL with url parameter at end', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://w.soundcloud.com/player/?color=ff5500&url=https%3A%2F%2Fsoundcloud.com%2Fuser%2Ftrack')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      expect(src).toContain('url=https%3A%2F%2Fsoundcloud.com%2Fuser%2Ftrack')
    })
  })

  describe('DTube Iframes', () => {
    it('should add sandbox attributes to DTube embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://emb.d.tube/#!/user/video')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
      expect(el.getAttribute('frameborder')).toBe('0')
      expect(el.getAttribute('allowfullscreen')).toBe('true')
    })

    it('should handle DTube URLs with query parameters', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://emb.d.tube/#!/user/video?autoplay=1')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    })
  })

  describe('VIMM Iframes', () => {
    it('should add sandbox attributes to VIMM embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.vimm.tv/channel123')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
      expect(el.getAttribute('frameborder')).toBe('0')
      expect(el.getAttribute('allowfullscreen')).toBe('true')
    })

    it('should handle VIMM URLs with query parameters', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.vimm.tv/channel123?param=value')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
    })
  })

  describe('Dapplr Iframes', () => {
    it('should add sandbox attributes to Dapplr embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://video.dapplr.in/file/dapplr-videos/video.mp4')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
      expect(el.getAttribute('frameborder')).toBe('0')
      expect(el.getAttribute('allowfullscreen')).toBe('true')
    })

    it('should handle protocol-relative Dapplr URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '//video.dapplr.in/file/dapplr-videos/video.mp4')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    })
  })

  describe('Truvvl Iframes', () => {
    it('should add portrait-embed class to Truvvl embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://embed.truvvl.com/@user/video123')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('class')).toBe('portrait-embed')
      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
      expect(el.getAttribute('frameborder')).toBe('0')
      expect(el.getAttribute('allowfullscreen')).toBe('true')
    })

    it('should handle Truvvl URLs with dashes and dots in username', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://embed.truvvl.com/@user.name-123/video456')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('class')).toBe('portrait-embed')
    })
  })

  describe('LBRY Iframes', () => {
    it('should add frameborder to LBRY embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://lbry.tv/$/embed/video-name')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('frameborder')).toBe('0')
    })

    it('should handle protocol-relative LBRY URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '//lbry.tv/$/embed/video-name')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('frameborder')).toBe('0')
    })

    it('should handle LBRY URLs with query parameters', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://lbry.tv/$/embed/video-name?autoplay=1')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })
  })

  describe('Odysee Iframes', () => {
    it('should add frameborder to Odysee embed with $ sign', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://odysee.com/$/embed/video-name')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('frameborder')).toBe('0')
    })

    it('should handle Odysee embed with URL-encoded $ sign', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://odysee.com/%24/embed/video-name')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('frameborder')).toBe('0')
    })

    it('should handle protocol-relative Odysee URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '//odysee.com/$/embed/video-name')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })

    it('should handle Odysee embed with multi-segment path (@user/video)', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://odysee.com/$/embed/@rodrigopanajotti:6/como-o-skatista-se-sente-depois-de-andar:4483afbf0f0a1c39e4f88bae4f00fcfed3a0870e?r=6T4RwZHsDQ5vpfHvtaLmLT9Dq26qzkoy')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('frameborder')).toBe('0')
    })

    it('should handle Odysee embed with multi-segment path and no query string', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://odysee.com/$/embed/@channel:a/video-title:b')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('frameborder')).toBe('0')
    })
  })

  describe('Skatehive IPFS Iframes', () => {
    // The gateway serves a raw mp4, so an <iframe> would become an autoplaying
    // media document. We render a controlled <video> with no autoplay instead.
    it('should convert a Skatehive IPFS embed into a controlled <video> (no autoplay)', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://ipfs.skatehive.app/ipfs/QmHash123')
      parent.appendChild(el)

      iframe(el)

      // iframe is replaced by a <video>
      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
      expect(hasChildWithTag(parent, 'video')).toBe(true)

      const video = findChildWithTag(parent, 'video')
      expect(video.getAttribute('src')).toBe('https://ipfs.skatehive.app/ipfs/QmHash123')
      expect(video.getAttribute('controls')).toBe('')
      // critical: never autoplays
      expect(video.getAttribute('autoplay')).toBeNull()
    })
  })

  describe('Skatehype Iframes', () => {
    it('should allow Skatehype embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.skatehype.com/ifplay.php?v=33426')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('src')).toBe('https://www.skatehype.com/ifplay.php?v=33426')
      expect(el.getAttribute('frameborder')).toBe('0')
      expect(el.getAttribute('allowfullscreen')).toBe('true')
    })

    it('should allow Skatehype embed without www', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://skatehype.com/ifplay.php?v=33426')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('allowfullscreen')).toBe('true')
    })

    it('should normalize protocol-relative Skatehype URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '//www.skatehype.com/ifplay.php?v=33426')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('src')).toBe('https://www.skatehype.com/ifplay.php?v=33426')
      expect(el.getAttribute('frameborder')).toBe('0')
      expect(el.getAttribute('allowfullscreen')).toBe('true')
    })

    it('should upgrade http Skatehype URLs to https (avoid mixed content)', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'http://www.skatehype.com/ifplay.php?v=33426')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('src')).toBe('https://www.skatehype.com/ifplay.php?v=33426')
    })

    it('should allow Skatehype embed with trailing query params', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.skatehype.com/ifplay.php?v=33426&autoplay=1')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('allowfullscreen')).toBe('true')
    })

    it('should not match Skatehype URLs with a non-numeric id', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.skatehype.com/ifplay.php?v=123abc')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBeTruthy()
    })
  })

  describe('Archive.org Iframes', () => {
    it('should allow archive.org embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://archive.org/embed/video-id')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })

    it('should handle protocol-relative archive.org URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '//archive.org/embed/video-id')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })

    it('should handle archive.org URLs with query parameters', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://archive.org/embed/video-id?autoplay=1')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })
  })

  describe('Rumble Iframes', () => {
    it('should add frameborder to Rumble embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://rumble.com/embed/v123abc/?pub=xyz')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('frameborder')).toBe('0')
    })
  })

  describe('Brighteon Iframes', () => {
    it('should add frameborder to Brighteon embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.brighteon.com/embed/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('frameborder')).toBe('0')
    })

    it('should handle Brighteon without www', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://brighteon.com/embed/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('frameborder')).toBe('0')
    })

    it('should handle Brighteon with numeric IDs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.brighteon.com/123456789')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })
  })

  describe('Brand New Tube Iframes', () => {
    it('should add frameborder to Brand New Tube embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://brandnewtube.com/embed/abc123xyz')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('frameborder')).toBe('0')
    })
  })

  describe('Loom Iframes', () => {
    it('should add frameborder to Loom embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.loom.com/embed/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('frameborder')).toBe('0')
    })

    it('should handle protocol-relative Loom URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '//www.loom.com/embed/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })

    it('should handle Loom URLs with query parameters', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.loom.com/embed/abc123?hide_owner=true')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })
  })

  describe('Aureal Iframes', () => {
    it('should add frameborder to Aureal embed', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://aureal-embed.web.app/123456')
      parent.appendChild(el)

      iframe(el)

      expect(el.getAttribute('frameborder')).toBe('0')
    })

    it('should handle Aureal without www', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://aureal-embed.web.app/789012')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })

    it('should not match bare hostnames without protocol slashes', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      // After fix: regex requires // so bare hostnames don't match
      el.setAttribute('src', 'aureal-embed.web.app/123456')
      parent.appendChild(el)

      iframe(el)

      // Should be replaced with unsupported div (relative URL not allowed)
      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBe(true)
    })

    it('should handle protocol-relative Aureal URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '//aureal-embed.web.app/123456')
      parent.appendChild(el)

      iframe(el)

      // Should normalize to https://
      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('src')).toBe('https://aureal-embed.web.app/123456')
      expect(el.getAttribute('frameborder')).toBe('0')
    })
  })

  describe('BitChute Iframes', () => {
    it('should allow BitChute video embeds', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.bitchute.com/video/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })

    it('should allow BitChute embed URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.bitchute.com/embed/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })

    it('should handle BitChute without www', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://bitchute.com/video/abc123')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })
  })

  describe('3Speak Audio Iframes', () => {
    it('should allow audio.3speak.tv embed with permlink', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://audio.3speak.tv/play?a=m6crhwqw')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('class')).toBe('speak-audio-iframe')
      expect(el.getAttribute('frameborder')).toBe('0')
      expect(el.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
    })

    it('should allow audio.3speak.tv embed with IPFS CID', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://audio.3speak.tv/play?cid=QmdMsEXyDe5Z4S3n8THfYgFP1iH3ngCeCytdHnndzqdZAK')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
      expect(el.getAttribute('class')).toBe('speak-audio-iframe')
    })

    it('should add iframe=1 parameter if not present', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://audio.3speak.tv/play?a=m6crhwqw')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      expect(src).toContain('iframe=1')
    })

    it('should not duplicate iframe parameter if already present', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://audio.3speak.tv/play?a=m6crhwqw&iframe=1')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      const iframeMatches = src.match(/iframe=/g)
      expect(iframeMatches).toHaveLength(1)
    })

    it('should add mode=compact if no mode specified', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://audio.3speak.tv/play?a=m6crhwqw')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      expect(src).toContain('mode=compact')
    })

    it('should not override existing mode parameter', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://audio.3speak.tv/play?a=m6crhwqw&mode=minimal')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      expect(src).toContain('mode=minimal')
      expect(src).not.toContain('mode=compact')
    })

    it('should handle audio.3speak.tv with mode=full', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://audio.3speak.tv/play?a=m6crhwqw&mode=full')
      parent.appendChild(el)

      iframe(el)

      const src = el.getAttribute('src')!
      expect(src).toContain('mode=full')
      const modeMatches = src.match(/mode=/g)
      expect(modeMatches).toHaveLength(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle null element', () => {
      expect(() => iframe(null)).not.toThrow()
    })

    it('should handle element without parent', () => {
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.youtube.com/embed/abc123')

      expect(() => iframe(el)).not.toThrow()
    })

    it('should handle element with detached parent', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://evil.com/malicious.html')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBeTruthy()
    })

    it('should preserve existing iframe after successful validation', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.youtube.com/embed/abc123')
      el.setAttribute('width', '560')
      el.setAttribute('height', '315')
      parent.appendChild(el)

      iframe(el)

      const foundEl = findChildWithTag(parent, 'iframe')
      expect(foundEl).toBe(el)
      expect(el.getAttribute('width')).toBe('560')
      expect(el.getAttribute('height')).toBe('315')
    })

    it('should handle malformed URLs gracefully', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'ht!tp://malformed..url')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBeTruthy()
    })

    it('should handle whitespace in src attribute', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', '   ')
      parent.appendChild(el)

      iframe(el)

      // Whitespace is not trimmed, so it's treated as unsupported URL
      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBe(true)
      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
    })

    it('should handle case-insensitive domain matching', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'HTTPS://WWW.YOUTUBE.COM/EMBED/ABC123')
      parent.appendChild(el)

      iframe(el)

      // Should still match and process YouTube URL
      expect(hasChildWithTag(parent, 'iframe')).toBe(true)
    })

    it('should not match case-insensitive Vimeo URLs', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      // VIMEO_EMBED_REGEX doesn't have 'i' flag, so it's case-sensitive
      el.setAttribute('src', 'https://Player.Vimeo.COM/video/123456789')
      parent.appendChild(el)

      iframe(el)

      // Should not match and be replaced with unsupported placeholder
      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBe(true)
    })

    it('should not allow unknown HTTPS domains', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://totally-legit-video-site.com/embed/video')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBeTruthy()
      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
    })

    it('should handle URLs with query parameters and fragments', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://www.youtube.com/embed/abc123?autoplay=1')
      parent.appendChild(el)

      iframe(el)

      // YouTube should strip query parameters
      expect(el.getAttribute('src')).toBe('https://www.youtube.com/embed/abc123')
    })
  })

  describe('Security - XSS Prevention', () => {
    it('should prevent XSS via data URI with HTML', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'data:text/html,<h1>XSS</h1>')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
      expect(hasChildWithClass(parent, 'unsupported-iframe')).toBeTruthy()
    })

    it('should prevent XSS via javascript URI', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'javascript:void(document.body.innerHTML="XSS")')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
    })

    it('should prevent XSS via vbscript URI', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'vbscript:msgbox("XSS")')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
    })

    it('should prevent path traversal attacks', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      el.setAttribute('src', 'https://example.com/../../etc/passwd')
      parent.appendChild(el)

      iframe(el)

      expect(hasChildWithTag(parent, 'iframe')).toBe(false)
    })

    it('should sanitize unsupported iframe placeholder text', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      const maliciousSrc = 'https://evil.com/xss<script>alert("XSS")</script>'
      el.setAttribute('src', maliciousSrc)
      parent.appendChild(el)

      iframe(el)

      const placeholder = findChildWithClass(parent, 'unsupported-iframe')
      expect(placeholder).toBeTruthy()
      // textContent should escape HTML entities
      const text = getTextContent(placeholder)
      expect(text).toContain(maliciousSrc)
      // But should not contain actual script tag
      expect(hasChildWithTag(parent, 'script')).toBe(false)
    })
  })

  describe('Provider Priority', () => {
    it('should process YouTube before other providers', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('iframe')
      // YouTube embed should be processed first
      el.setAttribute('src', 'https://www.youtube.com/embed/abc123?param=value')
      parent.appendChild(el)

      iframe(el)

      // Query params should be stripped (YouTube-specific behavior)
      expect(el.getAttribute('src')).toBe('https://www.youtube.com/embed/abc123')
    })
  })
})
