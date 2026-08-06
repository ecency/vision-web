import { markdown2Html } from '../markdown-2-html'
import { linkify } from './linkify.method'

describe('linkify() method - Content Linkification', () => {
  describe('hashtag linkification', () => {
    it('should linkify hashtags at start of content', () => {
      const content = '#bitcoin is great'
      const result = linkify(content, false)

      expect(result).toContain('class="er-tag er-tag-link"')
      expect(result).toContain('href="/trending/bitcoin"')
      expect(result).toContain('#bitcoin</a>')
    })

    it('should linkify hashtags after spaces', () => {
      const content = 'I love #cryptocurrency and #blockchain'
      const result = linkify(content, false)

      expect(result).toContain('href="/trending/cryptocurrency"')
      expect(result).toContain('href="/trending/blockchain"')
    })

    it('should linkify hashtags after closing tags', () => {
      const content = '<strong>Bold</strong>#technology'
      const result = linkify(content, false)

      expect(result).toContain('class="er-tag er-tag-link"')
      expect(result).toContain('href="/trending/technology"')
    })

    it('should not linkify hashtags with only numbers', () => {
      const content = 'Test #123 numbers'
      const result = linkify(content, false)

      expect(result).not.toContain('class="er-tag er-tag-link"')
      expect(result).toBe(content)
    })

    it('should lowercase hashtags in links', () => {
      const content = '#Bitcoin #CRYPTO'
      const result = linkify(content, false)

      expect(result).toContain('href="/trending/bitcoin"')
      expect(result).toContain('href="/trending/crypto"')
    })

    it('should use data-tag attribute for app mode', () => {
      const content = '#bitcoin'
      const result = linkify(content, true)

      expect(result).toContain('data-tag="bitcoin"')
      expect(result).not.toContain('href=')
    })
  })

  describe('user mention linkification', () => {
    it('should linkify user mentions at start of content', () => {
      const content = '@username wrote this'
      const result = linkify(content, false)

      expect(result).toContain('class="er-author er-author-link"')
      expect(result).toContain('href="/@username"')
      expect(result).toContain('er-author-link-image')
      expect(result).toContain('@username</a>')
    })

    it('should linkify user mentions after spaces', () => {
      const content = 'Thanks @alice and @bob'
      const result = linkify(content, false)

      expect(result).toContain('href="/@alice"')
      expect(result).toContain('href="/@bob"')
    })

    it('should preserve username case in display but lowercase in links', () => {
      const content = ' @username @alice'
      const result = linkify(content, false)

      expect(result).toContain('href="/@username"')
      expect(result).toContain('href="/@alice"')
    })

    it('should use data-author attribute for app mode', () => {
      const content = '@username'
      const result = linkify(content, true)

      expect(result).toContain('data-author="username"')
      expect(result).not.toContain('href=')
    })

    it('should handle usernames with dots', () => {
      const content = '@user.name is valid'
      const result = linkify(content, false)

      expect(result).toContain('href="/@user.name"')
    })

    it('should handle usernames with hyphens', () => {
      const content = '@user-name is valid'
      const result = linkify(content, false)

      expect(result).toContain('href="/@user-name"')
    })

    it('should not linkify bare @scope/package as any link type', () => {
      const content = '@user/name is post link'
      const result = linkify(content, false)

      // Bare @scope/package should NOT be treated as a Hive internal link
      // Only /@user/permlink (with leading /) should be
      expect(result).not.toContain('markdown-post-link')
      expect(result).not.toContain('er-author-link')
      expect(result).toContain('@user/name')
    })
  })

  describe('internal post links', () => {
    it('should linkify internal post links with /@author/permlink format', () => {
      const content = 'Check /@author/my-post here'
      const result = linkify(content, false)

      expect(result).toContain('class="markdown-post-link"')
      expect(result).toContain('href="/@author/my-post"')
    })

    it('should linkify internal links starting with /@', () => {
      const content = 'Read /@alice/awesome-article today'
      const result = linkify(content, false)

      expect(result).toContain('href="/@alice/awesome-article"')
    })

    it('should use data attributes for app mode', () => {
      const content = '/@bob/cool-post'
      const result = linkify(content, true)

      expect(result).toContain('data-author="bob"')
      expect(result).toContain('data-tag="post"')
      expect(result).toContain('data-permlink="cool-post"')
    })

    it('should handle profile section links', () => {
      const content = 'Visit /@user/wallet for details'
      const result = linkify(content, false)

      expect(result).toContain('class="markdown-profile-link"')
      expect(result).toContain('href="/@user/wallet"')
    })

    it('should use full URL for app mode with profile sections', () => {
      const content = '/@user/wallet'
      const result = linkify(content, true)

      expect(result).toContain('href="https://ecency.com/@user/wallet"')
    })

    it('should sanitize permlinks with query params', () => {
      const content = '/@author/post?param=value'
      const result = linkify(content, false)

      expect(result).toContain('href="/@author/post"')
    })

    it('should not linkify invalid permlinks', () => {
      const content = '/@author/invalid_permlink'
      const result = linkify(content, false)

      // Invalid permlink should not be linkified
      expect(result).toBe(content)
    })

    it('should not linkify npm-style scoped packages like @hiveio/x402', () => {
      const content = 'Install @hiveio/x402 for payments'
      const result = linkify(content, false)

      // Bare @scope/package must not become any kind of link
      expect(result).not.toContain('markdown-post-link')
      expect(result).not.toContain('er-author-link')
      expect(result).toContain('@hiveio/x402')
    })

    it('should linkify /category/@user/permlink format', () => {
      const content = 'Check /hive-173115/@alice/my-great-post here'
      const result = linkify(content, false)

      expect(result).toContain('class="markdown-post-link"')
      expect(result).toContain('href="/@alice/my-great-post"')
    })

    it('should linkify /category/@user/permlink in app mode with data attributes', () => {
      const content = '/hive-173115/@bob/cool-post'
      const result = linkify(content, true)

      expect(result).toContain('data-author="bob"')
      expect(result).toContain('data-tag="hive-173115"')
      expect(result).toContain('data-permlink="cool-post"')
    })
  })

  describe('image linkification', () => {
    it('should convert image URLs to HTML', () => {
      const content = 'https://example.com/image.jpg'
      const result = linkify(content, false)

      expect(result).toContain('<img')
      expect(result).toContain('src="https://i.ecency.com')
    })

    it('should handle PNG images', () => {
      const content = 'https://example.com/photo.png'
      const result = linkify(content, false)

      expect(result).toContain('<img')
    })

    it('should handle GIF images', () => {
      const content = 'https://example.com/animation.gif'
      const result = linkify(content, false)

      expect(result).toContain('<img')
    })

    it('should handle WebP images', () => {
      const content = 'https://example.com/image.webp'
      const result = linkify(content, false)

      expect(result).toContain('<img')
    })

    it('should convert multiple image URLs', () => {
      const content = 'https://example.com/first.jpg and https://example.com/second.jpg'
      const result = linkify(content, false)

      // Both images should be converted
      expect(result).toContain('<img')
      expect(result).toContain('i.ecency.com')
    })

    it('emits a <picture> (avif/webp) with a format=match fallback for the web (forApp=false)', () => {
      const content = 'https://example.com/image.jpg'
      const result = linkify(content, false)

      expect(result).toContain('<picture>')
      expect(result).toContain('format=avif')
      expect(result).toContain('format=webp')
      expect(result).toContain('format=match') // <img> fallback
    })

    it('keeps match format only (no <picture>) for the app (forApp=true)', () => {
      const content = 'https://example.com/image.jpg'
      const result = linkify(content, true)

      expect(result).toContain('format=match')
      expect(result).not.toContain('format=webp')
    })
  })

  describe('security - XSS prevention', () => {
    it('should not linkify invalid hashtags', () => {
      const content = '#<invalid>'
      const result = linkify(content, false)

      // Should not create a link for invalid tag
      expect(result).not.toContain('class="er-tag er-tag-link"')
    })

    it('should handle usernames with special characters', () => {
      const content = '@user test content'
      const result = linkify(content, false)

      // Valid username should be linkified
      expect(result).toContain('class="er-author er-author-link"')
      expect(result).toContain('href="/@user"')
    })

    it('should sanitize permlinks with special characters', () => {
      const content = '@author/<script>alert(1)</script>'
      const result = linkify(content, false)

      // Invalid permlink should not be processed as a valid post link
      expect(result).not.toContain('class="markdown-post-link"')
    })
  })

  describe('mixed content', () => {
    it('should handle hashtags and mentions together', () => {
      const content = '@alice wrote about #bitcoin'
      const result = linkify(content, false)

      expect(result).toContain('class="er-author er-author-link"')
      expect(result).toContain('href="/@alice"')
      expect(result).toContain('class="er-tag er-tag-link"')
      expect(result).toContain('href="/trending/bitcoin"')
    })

    it('should handle mentions and post links', () => {
      const content = '@alice check /@bob/my-article'
      const result = linkify(content, false)

      expect(result).toContain('href="/@alice"')
      expect(result).toContain('href="/@bob/my-article"')
    })

    it('should handle all types of content together', () => {
      const content = '@user wrote about #crypto in /@author/post with https://example.com/image.jpg'
      const result = linkify(content, false)

      expect(result).toContain('er-author-link')
      expect(result).toContain('er-tag-link')
      expect(result).toContain('markdown-post-link')
      expect(result).toContain('<img')
    })
  })

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = linkify('', false)
      expect(result).toBe('')
    })

    it('should handle content with no linkifiable items', () => {
      const content = 'Just plain text with no special content'
      const result = linkify(content, false)
      expect(result).toBe(content)
    })

    it('should handle multiple spaces', () => {
      const content = '   @user   #tag   '
      const result = linkify(content, false)

      expect(result).toContain('er-author-link')
      expect(result).toContain('er-tag-link')
    })

    it('should handle newlines', () => {
      const content = '@user\n#tag'
      const result = linkify(content, false)

      expect(result).toContain('er-author-link')
      expect(result).toContain('er-tag-link')
    })

    it('should handle very long content', () => {
      const content = 'a'.repeat(10000) + ' @user #tag'
      const result = linkify(content, false)

      expect(result).toContain('er-author-link')
      expect(result).toContain('er-tag-link')
    })
  })

  describe('inertAuthorAndTagChips option', () => {
    const inert = { inertAuthorAndTagChips: true }

    it('should render mentions as a span with no href', () => {
      const result = linkify('Thanks @username', false, inert)

      expect(result).toContain('<span class="er-author er-author-link">')
      expect(result).toContain('@username</span>')
      expect(result).not.toContain('href="/@username"')
      expect(result).not.toContain('<a class="er-author')
    })

    it('should keep the avatar image and its class on inert mentions', () => {
      const result = linkify('Thanks @username', false, inert)

      expect(result).toContain('class="er-author-link-image"')
      expect(result).toContain('/u/username/avatar/small')
      expect(result).toContain('alt="username"')
    })

    it('should render hashtags as a span with no href', () => {
      const result = linkify('#bitcoin is great', false, inert)

      expect(result).toContain('<span class="er-tag er-tag-link">')
      expect(result).toContain('#bitcoin</span>')
      expect(result).not.toContain('href="/trending/bitcoin"')
    })

    it('should leave both chips as links when the option is absent', () => {
      const result = linkify('Thanks @username #bitcoin', false)

      expect(result).toContain('href="/@username"')
      expect(result).toContain('href="/trending/bitcoin"')
      expect(result).not.toContain('<span class="er-author')
      expect(result).not.toContain('<span class="er-tag')
    })

    it('should leave both chips as links when the option is explicitly false', () => {
      const result = linkify('Thanks @username #bitcoin', false, {
        inertAuthorAndTagChips: false,
      })

      expect(result).toContain('href="/@username"')
      expect(result).toContain('href="/trending/bitcoin"')
    })

    it('should not affect the app render path, which emits no chips', () => {
      const result = linkify('Thanks @username #bitcoin', true, inert)

      expect(result).toContain('class="markdown-author-link" data-author="username"')
      expect(result).toContain('class="markdown-tag-link" data-tag="bitcoin"')
      expect(result).not.toContain('er-author-link')
      expect(result).not.toContain('er-tag-link')
    })
  })
})

describe('externalProfileBase option', () => {
  const ext = { externalProfileBase: 'https://ecency.com' }

  /**
   * A profile section is not a post, but it is emitted as an ordinary link, so
   * a consumer whose only matching route is `/:author/:permlink` routes it as
   * one and tries to load a post whose permlink is `wallet`. No route guard
   * catches that, because the route exists, and `inertAuthorAndTagChips` does
   * not, because this is not a chip.
   */
  it('sends profile sections to the external base', () => {
    const out = linkify('/@alice/wallet', false, ext)
    expect(out).toContain('href="https://ecency.com/@alice/wallet"')
    expect(out).not.toContain('href="/@alice/wallet"')
  })

  it('does the same for the category form', () => {
    const out = linkify('/hive-125125/@alice/followers', false, ext)
    expect(out).toContain('href="https://ecency.com/@alice/followers"')
  })

  /**
   * The point of the option is what it does NOT touch. A post link is real
   * content the consumer resolves from the chain, and keeping it internal is
   * the whole reason a self-hosted blog exists.
   */
  it('leaves real post links internal', () => {
    const out = linkify('/@alice/my-first-post', false, ext)
    expect(out).toContain('href="/@alice/my-first-post"')
    expect(out).not.toContain('ecency.com/@alice/my-first-post')
  })

  it('leaves the category post form internal too', () => {
    const out = linkify('/hive-125125/@alice/my-first-post', false, ext)
    expect(out).toContain('href="/@alice/my-first-post"')
  })

  /** Unset is the old behaviour exactly, so no existing consumer moves. */
  it('changes nothing when the option is absent', () => {
    expect(linkify('/@alice/wallet', false)).toContain('href="/@alice/wallet"')
  })
})

/**
 * Through `markdown2Html`, the entry point consumers actually call.
 *
 * `linkify` above proves the branch; this proves the option survives the
 * journey, since it has to pass through markdown2Html into markdownToHTML and
 * be part of the memo cache key. An option that is correct and never arrives
 * looks exactly like one that does nothing.
 */
describe('externalProfileBase through markdown2Html', () => {
  const opts = {
    inertAuthorAndTagChips: true,
    externalProfileBase: 'https://ecency.com',
  }

  it('externalizes a profile section and keeps a post link internal', () => {
    const out = markdown2Html('/@alice/wallet and /@alice/my-post', false, false, 'ecency.com', undefined, opts)
    expect(out).toContain('https://ecency.com/@alice/wallet')
    expect(out).toContain('href="/@alice/my-post"')
  })

  /**
   * The cache key has to carry the option, or the first render of an entry wins
   * for every later one and a consumer that passes it gets whatever the
   * previous consumer produced.
   *
   * An ENTRY, not a string. `markdown2Html` returns early for a string, before
   * `cacheGet` and `cacheSet` are ever reached, so the first version of this
   * test passed with the option removed from the key entirely: it never touched
   * the cache it claimed to be testing. Only the entry overload does.
   *
   * The identity is `author-permlink-last_update-updated`, so both calls use
   * the same fixture and the key differs only by the option.
   */
  it('does not serve a cached render made without the option', () => {
    const entry = {
      author: 'bob',
      permlink: 'cache-key-fixture',
      last_update: '2026-08-06T00:00:00',
      updated: '2026-08-06T00:00:00',
      body: '/@bob/followers is here',
    } as never

    const plain = markdown2Html(entry, false, false, 'ecency.com', undefined, {
      inertAuthorAndTagChips: true,
    })
    const external = markdown2Html(entry, false, false, 'ecency.com', undefined, opts)

    expect(plain).toContain('href="/@bob/followers"')
    expect(external).toContain('https://ecency.com/@bob/followers')
  })

  /** Order-independent: the cached-first path must hold in reverse too. */
  it('does not serve the option render to a caller that passed none', () => {
    const entry = {
      author: 'carol',
      permlink: 'cache-key-fixture-reverse',
      last_update: '2026-08-06T00:00:00',
      updated: '2026-08-06T00:00:00',
      body: '/@carol/followers is here',
    } as never

    const external = markdown2Html(entry, false, false, 'ecency.com', undefined, opts)
    const plain = markdown2Html(entry, false, false, 'ecency.com', undefined, {
      inertAuthorAndTagChips: true,
    })

    expect(external).toContain('https://ecency.com/@carol/followers')
    expect(plain).toContain('href="/@carol/followers"')
  })
})
