import { describe, it, expect } from 'vitest'
import { isAllowedEmbedSrc } from './embed-hosts.const'

describe('isAllowedEmbedSrc', () => {
  describe('accepts the embed URLs the renderer emits', () => {
    const allowed = [
      'https://www.youtube.com/embed/qK3d1eoH-Qs?autoplay=1',
      'https://www.youtube-nocookie.com/embed/qK3d1eoH-Qs',
      'https://play.3speak.tv/watch?v=wehmoen/xrhjxocx&mode=iframe',
      'https://emb.d.tube/#!/scottcbusiness/g04n2bbp',
      'https://www.bitchute.com/embed/abc123/',
      'https://www.rumble.com/embed/abc123/?pub=4',
      'https://www.brighteon.com/embed/abc123',
      'https://player.vimeo.com/video/123456',
      'https://player.twitch.tv/?channel=somechannel',
      'https://open.spotify.com/embed/playlist/abc',
      'https://www.loom.com/embed/abc',
      // Odysee: the renderer emits the literal `$`, its own share dialog emits
      // the percent-encoded spelling; URL.pathname decodes neither.
      'https://odysee.com/$/embed/@channel:2/video:e',
      'https://odysee.com/%24/embed/%40channel%3A2%2Fvideo%3Ae?r=abc',
      // host-only providers (no path constraint)
      'https://player.region.dapplr.in/something',
      'https://archive.org/embed/whatever'
    ]
    it.each(allowed)('accepts %s', (url) => {
      expect(isAllowedEmbedSrc(url)).toBe(true)
    })
  })

  describe('rejects non-https / non-allowlisted / spoofed hosts', () => {
    const blocked = [
      ['', 'empty'],
      [null, 'null'],
      [undefined, 'undefined'],
      ['javascript:alert(document.domain)', 'javascript scheme'],
      ['data:text/html,<script>alert(1)</script>', 'data scheme'],
      ['http://www.youtube.com/embed/abc', 'http (non-https) on allowed host'],
      ['//www.youtube.com/embed/abc', 'protocol-relative'],
      ['https://evil.example/embed/abc', 'non-allowlisted host'],
      ['https://www.youtube.com@evil.com/embed/abc', 'userinfo smuggling (host is evil.com)'],
      ['https://play.3speak.tv.evil.com/watch?v=x', 'subdomain-suffix spoof'],
      ['https://xdapplr.in/x', 'dapplr suffix without leading dot'],
      ['https://dapplr.in.evil.com/x', 'dapplr as a left-hand label']
    ] as const
    it.each(blocked)('rejects %s (%s)', (url) => {
      expect(isAllowedEmbedSrc(url as string | null)).toBe(false)
    })
  })

  describe('rejects non-embed paths on an allowed host', () => {
    const blocked = [
      'https://www.youtube.com/redirect?q=https://evil.example', // open-redirect endpoint
      'https://www.youtube.com/watch?v=abc', // watch page, not /embed/
      'https://www.youtube.com/@evil.com', // backslash-trick path lands here, still not /embed/
      'https://play.3speak.tv/login',
      'https://www.bitchute.com/video/abc',
      'https://open.spotify.com/playlist/abc', // missing /embed
      'https://player.vimeo.com/channels/abc', // not /video/
      'https://odysee.com/@channel:2/video:e', // watch page, not /$/embed/
      'https://odysee.com/$/download/@channel:2/video:e' // another /$/ route
    ]
    it.each(blocked)('rejects %s', (url) => {
      expect(isAllowedEmbedSrc(url)).toBe(false)
    })
  })
})
