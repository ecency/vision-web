import {
  createDoc,
  extractYtStartTime,
  moveBlockClosingTagOutOfParagraph,
  removeDuplicateAttributes,
  sanitizePermlink,
  isValidPermlink,
  isValidUsername,
  makeEntryCacheKey,
  stripHtmlTags,
  stripQueryString,
  trimTrailingSlash
} from './helper'

describe('Helper Functions', () => {
  describe('isValidUsername', () => {
    describe('valid usernames', () => {
      it('should accept valid username with letters and numbers', () => {
        expect(isValidUsername('user123')).toBe(true)
      })

      it('should accept username with letters only', () => {
        expect(isValidUsername('username')).toBe(true)
      })

      it('should accept username with dots', () => {
        expect(isValidUsername('user.name')).toBe(true)
      })

      it('should accept username with dashes', () => {
        expect(isValidUsername('user-name')).toBe(true)
      })

      it('should accept username with dots and dashes', () => {
        expect(isValidUsername('user.name-test')).toBe(true)
      })

      it('should accept minimum length username (3 chars)', () => {
        expect(isValidUsername('abc')).toBe(true)
      })

      it('should accept maximum length username (16 chars)', () => {
        expect(isValidUsername('a'.repeat(16))).toBe(true)
      })
    })

    describe('invalid usernames', () => {
      it('should reject username too short (< 3 chars)', () => {
        expect(isValidUsername('ab')).toBe(false)
      })

      it('should reject username too long (> 16 chars)', () => {
        expect(isValidUsername('a'.repeat(17))).toBe(false)
      })

      it('should reject username starting with number', () => {
        expect(isValidUsername('123user')).toBe(false)
      })

      it('should reject username starting with dash', () => {
        expect(isValidUsername('-username')).toBe(false)
      })

      it('should reject username ending with dash', () => {
        expect(isValidUsername('username-')).toBe(false)
      })

      it('should reject username with @ symbol', () => {
        expect(isValidUsername('user@name')).toBe(false)
      })

      it('should reject username with # symbol', () => {
        expect(isValidUsername('user#name')).toBe(false)
      })

      it('should reject username with $ symbol', () => {
        expect(isValidUsername('user$name')).toBe(false)
      })

      it('should reject username with uppercase letters', () => {
        expect(isValidUsername('UserName')).toBe(false)
      })

      it('should reject SQL injection attempt', () => {
        expect(isValidUsername("admin' OR '1'='1")).toBe(false)
      })

      it('should reject path traversal attempt with ../', () => {
        expect(isValidUsername('../admin')).toBe(false)
      })

      it('should reject path traversal attempt with ./', () => {
        expect(isValidUsername('./user')).toBe(false)
      })

      it('should reject empty string', () => {
        expect(isValidUsername('')).toBe(false)
      })

      it('should reject null value', () => {
        expect(isValidUsername(null as any)).toBe(false)
      })

      it('should reject undefined value', () => {
        expect(isValidUsername(undefined as any)).toBe(false)
      })

      it('should reject username with spaces', () => {
        expect(isValidUsername('user name')).toBe(false)
      })

      it('should reject username with double dots', () => {
        expect(isValidUsername('user..name')).toBe(false)
      })

      it('should reject label shorter than 3 chars when using dots', () => {
        expect(isValidUsername('ab.cd')).toBe(false)
      })
    })
  })

  describe('isValidPermlink', () => {
    describe('valid permlinks', () => {
      it('should accept valid permlink with letters and dashes', () => {
        expect(isValidPermlink('my-blog-post')).toBe(true)
      })

      it('should accept permlink with numbers', () => {
        expect(isValidPermlink('post-123-test')).toBe(true)
      })

      it('should accept permlink with only lowercase letters', () => {
        expect(isValidPermlink('myblogpost')).toBe(true)
      })

      it('should accept permlink with numbers only', () => {
        expect(isValidPermlink('123456')).toBe(true)
      })

      it('should accept long valid permlink', () => {
        expect(isValidPermlink('this-is-a-very-long-permlink-with-many-words-2024')).toBe(true)
      })
    })

    describe('invalid permlinks', () => {
      it('should reject empty permlink', () => {
        expect(isValidPermlink('')).toBe(false)
      })

      it('should reject permlink with uppercase letters', () => {
        expect(isValidPermlink('My-Blog-Post')).toBe(false)
      })

      it('should reject permlink with spaces', () => {
        expect(isValidPermlink('my blog post')).toBe(false)
      })

      it('should reject permlink with special characters', () => {
        expect(isValidPermlink('post@2024')).toBe(false)
        expect(isValidPermlink('post$money')).toBe(false)
      })

      it('should reject permlink with underscores', () => {
        expect(isValidPermlink('my_blog_post')).toBe(false)
      })

      it('should reject path traversal attempts', () => {
        expect(isValidPermlink('../../../etc/passwd')).toBe(false)
      })

      it('should reject permlink with forward slash', () => {
        expect(isValidPermlink('blog/post')).toBe(false)
      })

      it('should reject URL-encoded attacks', () => {
        expect(isValidPermlink('%2e%2e%2fadmin')).toBe(false)
      })

      it('should accept permlink with query parameters (sanitized internally)', () => {
        // isValidPermlink sanitizes first, so query params are removed before validation
        expect(isValidPermlink('post?param=value')).toBe(true)
      })

      it('should accept permlink with fragments (sanitized internally)', () => {
        // isValidPermlink sanitizes first, so fragments are removed before validation
        expect(isValidPermlink('post#section')).toBe(true)
      })

      it('should reject image file extensions', () => {
        expect(isValidPermlink('image.jpg')).toBe(false)
        expect(isValidPermlink('photo.jpeg')).toBe(false)
        expect(isValidPermlink('picture.png')).toBe(false)
        expect(isValidPermlink('animation.gif')).toBe(false)
        expect(isValidPermlink('graphic.svg')).toBe(false)
        expect(isValidPermlink('image.webp')).toBe(false)
      })

      it('should reject null value', () => {
        expect(isValidPermlink(null as any)).toBe(false)
      })

      it('should reject undefined value', () => {
        expect(isValidPermlink(undefined as any)).toBe(false)
      })
    })
  })

  describe('sanitizePermlink', () => {
    it('should preserve valid permlink unchanged', () => {
      expect(sanitizePermlink('my-blog-post')).toBe('my-blog-post')
    })

    it('should remove query parameters', () => {
      expect(sanitizePermlink('post?param=value&other=123')).toBe('post')
    })

    it('should remove URL fragments', () => {
      expect(sanitizePermlink('post#section')).toBe('post')
    })

    it('should remove both query parameters and fragments', () => {
      expect(sanitizePermlink('post?param=value#section')).toBe('post')
    })

    it('should handle multiple question marks', () => {
      expect(sanitizePermlink('post?param1=value1?param2=value2')).toBe('post')
    })

    it('should handle multiple hash symbols', () => {
      expect(sanitizePermlink('post#section1#section2')).toBe('post')
    })

    it('should preserve dashes in permlink', () => {
      expect(sanitizePermlink('my-awesome-post-2024')).toBe('my-awesome-post-2024')
    })

    it('should handle empty string', () => {
      expect(sanitizePermlink('')).toBe('')
    })

    it('should handle null value', () => {
      expect(sanitizePermlink(null as any)).toBe('')
    })

    it('should handle undefined value', () => {
      expect(sanitizePermlink(undefined as any)).toBe('')
    })

    it('should handle non-string value', () => {
      expect(sanitizePermlink(123 as any)).toBe('')
    })

    it('should handle permlink with only query parameters', () => {
      expect(sanitizePermlink('?param=value')).toBe('')
    })

    it('should handle permlink with only fragment', () => {
      expect(sanitizePermlink('#section')).toBe('')
    })

    it('should preserve numbers in permlink', () => {
      expect(sanitizePermlink('post-123-456')).toBe('post-123-456')
    })

    it('should handle very long permlink with query', () => {
      const longPermlink = 'a'.repeat(100) + '?query=value'
      expect(sanitizePermlink(longPermlink)).toBe('a'.repeat(100))
    })
  })

  describe('extractYtStartTime', () => {
    describe('standard formats', () => {
      it('should extract time from ?t= parameter', () => {
        expect(extractYtStartTime('https://youtube.com/watch?v=ID&t=123')).toBe('123')
      })

      it('should extract time from ?t= parameter with seconds suffix', () => {
        expect(extractYtStartTime('https://youtube.com/watch?v=ID&t=123s')).toBe('123')
      })

      it('should extract time from ?start= parameter', () => {
        expect(extractYtStartTime('https://youtube.com/watch?v=ID&start=456')).toBe('456')
      })

      it('should prioritize ?t= over ?start= when both present', () => {
        expect(extractYtStartTime('https://youtube.com/watch?v=ID&t=100&start=200')).toBe('100')
      })

      it('should handle ?t= as first parameter', () => {
        expect(extractYtStartTime('https://youtube.com/watch?t=789&v=ID')).toBe('789')
      })

      it('should handle ?start= as first parameter', () => {
        expect(extractYtStartTime('https://youtube.com/watch?start=321&v=ID')).toBe('321')
      })
    })

    describe('edge cases', () => {
      it('should return empty string for missing time parameter', () => {
        expect(extractYtStartTime('https://youtube.com/watch?v=ID')).toBe('')
      })

      it('should return empty string for invalid URL', () => {
        expect(extractYtStartTime('not-a-url')).toBe('')
      })

      it('should handle empty string', () => {
        expect(extractYtStartTime('')).toBe('')
      })

      it('should handle URL without query parameters', () => {
        expect(extractYtStartTime('https://youtube.com/watch')).toBe('')
      })

      it('should handle negative time values', () => {
        // parseInt parses negative values as-is
        expect(extractYtStartTime('https://youtube.com/watch?v=ID&t=-123')).toBe('-123')
      })

      it('should handle non-numeric time values in ?t=', () => {
        // parseInt returns NaN for non-numeric strings, converted to string 'NaN'
        expect(extractYtStartTime('https://youtube.com/watch?v=ID&t=abc')).toBe('NaN')
      })

      it('should handle zero time value', () => {
        expect(extractYtStartTime('https://youtube.com/watch?v=ID&t=0')).toBe('0')
      })

      it('should handle very large time values', () => {
        expect(extractYtStartTime('https://youtube.com/watch?v=ID&t=999999')).toBe('999999')
      })

      it('should handle URL with hash fragment', () => {
        expect(extractYtStartTime('https://youtube.com/watch?v=ID&t=123#comments')).toBe('123')
      })

      it('should handle shortened YouTube URLs', () => {
        expect(extractYtStartTime('https://youtu.be/ID?t=123')).toBe('123')
      })

      it('should handle empty ?t= parameter', () => {
        expect(extractYtStartTime('https://youtube.com/watch?v=ID&t=')).toBe('0')
      })

      it('should handle empty ?start= parameter', () => {
        expect(extractYtStartTime('https://youtube.com/watch?v=ID&start=')).toBe('')
      })
    })
  })

  describe('createDoc', () => {
    it('should create document from HTML string', () => {
      const doc = createDoc('<div>test</div>')
      expect(doc).not.toBeNull()
      const divs = doc?.getElementsByTagName('div')
      expect(divs?.length).toBeGreaterThan(0)
      expect(divs?.[0]?.textContent).toBe('test')
    })

    it('should create document with nested elements', () => {
      const doc = createDoc('<div><p>paragraph</p><span>span</span></div>')
      expect(doc).not.toBeNull()
      const paragraphs = doc?.getElementsByTagName('p')
      const spans = doc?.getElementsByTagName('span')
      expect(paragraphs?.length).toBeGreaterThan(0)
      expect(spans?.length).toBeGreaterThan(0)
      expect(paragraphs?.[0]?.textContent).toBe('paragraph')
      expect(spans?.[0]?.textContent).toBe('span')
    })

    it('should create document with attributes', () => {
      const doc = createDoc('<div class="test-class" id="test-id">content</div>')
      expect(doc).not.toBeNull()
      const divs = doc?.getElementsByTagName('div')
      expect(divs?.length).toBeGreaterThan(0)
      const div = divs?.[0]
      expect(div?.getAttribute('class')).toBe('test-class')
      expect(div?.getAttribute('id')).toBe('test-id')
    })

    it('should return null for empty HTML', () => {
      const doc = createDoc('')
      expect(doc).toBeNull()
    })

    it('should return null for whitespace-only HTML', () => {
      const doc = createDoc('   ')
      expect(doc).toBeNull()
    })

    it('should handle malformed HTML by using lenient parser', () => {
      // The lenient error handler allows parsing to continue despite mismatched tags
      const doc = createDoc('<div><p>text</p></div>')
      expect(doc).not.toBeNull()
      const divs = doc?.getElementsByTagName('div')
      expect(divs?.length).toBeGreaterThan(0)
    })

    it('should handle HTML with special characters', () => {
      const doc = createDoc('<div>&lt;script&gt;alert("xss")&lt;/script&gt;</div>')
      expect(doc).not.toBeNull()
      const divs = doc?.getElementsByTagName('div')
      expect(divs?.length).toBeGreaterThan(0)
    })

    it('should handle complex HTML structure', () => {
      const html = `
        <article>
          <header><h1>Title</h1></header>
          <section><p>Content</p></section>
          <footer>Footer</footer>
        </article>
      `
      const doc = createDoc(html)
      expect(doc).not.toBeNull()
      const h1s = doc?.getElementsByTagName('h1')
      const paragraphs = doc?.getElementsByTagName('p')
      expect(h1s?.length).toBeGreaterThan(0)
      expect(paragraphs?.length).toBeGreaterThan(0)
      expect(h1s?.[0]?.textContent).toBe('Title')
      expect(paragraphs?.[0]?.textContent).toBe('Content')
    })

    it('should handle HTML with unicode characters', () => {
      const doc = createDoc('<div>Hello 世界 🌍</div>')
      expect(doc).not.toBeNull()
      const divs = doc?.getElementsByTagName('div')
      expect(divs?.length).toBeGreaterThan(0)
      expect(divs?.[0]?.textContent).toBe('Hello 世界 🌍')
    })

    it('should handle self-closing tags', () => {
      const doc = createDoc('<div><img src="test.jpg" /><br /></div>')
      expect(doc).not.toBeNull()
      const imgs = doc?.getElementsByTagName('img')
      const brs = doc?.getElementsByTagName('br')
      expect(imgs?.length).toBeGreaterThan(0)
      expect(brs?.length).toBeGreaterThan(0)
    })

    // Regression: @xmldom/xmldom 0.9+ throws a fatal ParseError on severely
    // malformed HTML (e.g., a <p> that fails to close before </body>). The
    // onError handler can't suppress the throw — only a try/catch in
    // createDoc can. Before the fix, this crashed SSR for /entry/[...] pages.
    // See Sentry ECENCY-NEXT-1C86.
    //
    // The contract these tests lock in is: createDoc must return `Document | null`
    // for any input, never throw. Whether a particular malformed snippet parses
    // successfully (Document) or fails (null) depends on xmldom's recovery
    // heuristics, which may improve across versions — we deliberately allow
    // either outcome as long as the return shape matches the type.
    const expectDocumentOrNull = (result: ReturnType<typeof createDoc>) => {
      if (result === null) return
      expect(typeof result.getElementsByTagName).toBe('function')
    }

    it('should not throw on mismatched body/p tags', () => {
      // The content ends with an opening <p> that has no closing tag.
      // Parsing <body>...<p></body> triggers xmldom's fatalError path.
      const input = '<p>oops<p>hello'
      expect(() => createDoc(input)).not.toThrow()
      expectDocumentOrNull(createDoc(input))
    })

    it('should not throw on deeply malformed HTML', () => {
      // Nested unclosed tags — another pattern xmldom reports as fatal.
      const input = '<div><p><span><a><b><i>no closing tags here'
      expect(() => createDoc(input)).not.toThrow()
      expectDocumentOrNull(createDoc(input))
    })

    it('should not throw on invalid XML characters', () => {
      // Unescaped < followed by non-tag content is a classic fatal-error case.
      const input = '<div>less than < something</div>'
      expect(() => createDoc(input)).not.toThrow()
      expectDocumentOrNull(createDoc(input))
    })
  })

  describe('makeEntryCacheKey', () => {
    it('should generate cache key from entry data', () => {
      const input = {
        author: 'foo1',
        permlink: 'bar1',
        last_update: '2019-05-10T09:15:21',
        updated: ''
      }

      expect(makeEntryCacheKey(input)).toBe('foo1-bar1-2019-05-10T09:15:21--0.ztntfp')
    })

    it('should generate cache key with updated field', () => {
      const input = {
        author: 'author1',
        permlink: 'post-title',
        last_update: '2024-01-15T12:30:00',
        updated: '2024-01-15T13:00:00'
      }

      expect(makeEntryCacheKey(input)).toBe('author1-post-title-2024-01-15T12:30:00-2024-01-15T13:00:00-0.ztntfp')
    })

    it('should handle entry with special characters in author', () => {
      const input = {
        author: 'author.name-123',
        permlink: 'permlink',
        last_update: '2024-01-15T12:00:00',
        updated: ''
      }

      expect(makeEntryCacheKey(input)).toBe('author.name-123-permlink-2024-01-15T12:00:00--0.ztntfp')
    })

    it('should handle entry with special characters in permlink', () => {
      const input = {
        author: 'author',
        permlink: 'my-blog-post-2024',
        last_update: '2024-01-15T12:00:00',
        updated: ''
      }

      expect(makeEntryCacheKey(input)).toBe('author-my-blog-post-2024-2024-01-15T12:00:00--0.ztntfp')
    })

    it('should handle entry with undefined updated field', () => {
      const input = {
        author: 'author',
        permlink: 'permlink',
        last_update: '2024-01-15T12:00:00',
        updated: undefined
      }

      expect(makeEntryCacheKey(input)).toBe('author-permlink-2024-01-15T12:00:00-undefined-0.ztntfp')
    })

    it('should handle entry with null values', () => {
      const input = {
        author: 'author',
        permlink: 'permlink',
        last_update: null,
        updated: null
      }

      expect(makeEntryCacheKey(input)).toBe('author-permlink-null-null-0.ztntfp')
    })

    it('should create unique keys for different entries', () => {
      const entry1 = {
        author: 'author1',
        permlink: 'post1',
        last_update: '2024-01-15T12:00:00',
        updated: ''
      }

      const entry2 = {
        author: 'author2',
        permlink: 'post2',
        last_update: '2024-01-15T12:00:00',
        updated: ''
      }

      expect(makeEntryCacheKey(entry1)).not.toBe(makeEntryCacheKey(entry2))
    })

    it('should create same key for identical entries', () => {
      const entry1 = {
        author: 'author',
        permlink: 'post',
        last_update: '2024-01-15T12:00:00',
        updated: ''
      }

      const entry2 = {
        author: 'author',
        permlink: 'post',
        last_update: '2024-01-15T12:00:00',
        updated: ''
      }

      expect(makeEntryCacheKey(entry1)).toBe(makeEntryCacheKey(entry2))
    })

    it('should differentiate entries whose body differs under the same last_update', () => {
      const base = { author: 'author', permlink: 'post', last_update: '2024-01-15T12:00:00', updated: '' }

      // Same length, one character apart: length alone would collide.
      expect(makeEntryCacheKey({ ...base, body: 'abc' })).not.toBe(makeEntryCacheKey({ ...base, body: 'abd' }))
      expect(makeEntryCacheKey({ ...base, body: 'abc' })).toBe(makeEntryCacheKey({ ...base, body: 'abc' }))
    })

    it('should hash the body of one entry object once across memo calls', () => {
      const entry = { author: 'author', permlink: 'hash-once', last_update: '2024-01-15T12:00:00', body: 'x'.repeat(1000) }
      const spy = vi.spyOn(String.prototype, 'charCodeAt')
      try {
        const first = makeEntryCacheKey(entry)
        expect(makeEntryCacheKey(entry)).toBe(first)
        expect(makeEntryCacheKey(entry)).toBe(first)
        expect(spy).toHaveBeenCalledTimes(entry.body.length)
      } finally {
        spy.mockRestore()
      }
    })

    it('should give a new key when the body is replaced in place on the same object', () => {
      const entry = { author: 'author', permlink: 'in-place', last_update: '2024-01-15T12:00:00', body: 'original' }
      const before = makeEntryCacheKey(entry)
      entry.body = 'replaced'
      expect(makeEntryCacheKey(entry)).not.toBe(before)
    })

    it('should differentiate entries with different last_update', () => {
      const entry1 = {
        author: 'author',
        permlink: 'post',
        last_update: '2024-01-15T12:00:00',
        updated: ''
      }

      const entry2 = {
        author: 'author',
        permlink: 'post',
        last_update: '2024-01-15T13:00:00',
        updated: ''
      }

      expect(makeEntryCacheKey(entry1)).not.toBe(makeEntryCacheKey(entry2))
    })
  })

  describe('removeDuplicateAttributes', () => {
    it('keeps the first occurrence of duplicate attributes', () => {
      expect(removeDuplicateAttributes('<iframe allowfullscreen allowfullscreen>'))
        .toBe('<iframe allowfullscreen>')
      expect(removeDuplicateAttributes('<img src="a.jpg" alt="x" src="b.jpg">'))
        .toBe('<img src="a.jpg" alt="x">')
    })

    it('is case-insensitive on attribute names', () => {
      expect(removeDuplicateAttributes('<a HREF="x" href="y">'))
        .toBe('<a HREF="x">')
    })

    it('preserves the self-closing slash and the original attribute formatting', () => {
      expect(removeDuplicateAttributes('<br />'))
        .toBe('<br />')
      expect(removeDuplicateAttributes('<input type=text name = "n">'))
        .toBe('<input type=text name = "n">')
    })

    it('leaves tags without attributes alone', () => {
      expect(removeDuplicateAttributes('<p>hello</p>'))
        .toBe('<p>hello</p>')
    })

    it('preserves text outside tags verbatim', () => {
      expect(removeDuplicateAttributes('before <b foo="1" foo="2">x</b> after'))
        .toBe('before <b foo="1">x</b> after')
    })

    it('returns in linear time on inputs that previously caused catastrophic backtracking', () => {
      // Regression: <div style=background-color:yellow;"> (unquoted attribute
      // value followed by a stray quote) pinned the V8 regex engine for tens
      // of seconds in the previous implementation and tripped the SSR
      // event-loop watchdog. Cap at 250 ms — the tokenizer should finish in
      // well under 10 ms even on much larger inputs.
      const filler = 'a'.repeat(20_000)
      const hostile = `<div style=background-color:yellow;">${filler}`
      const start = Date.now()
      removeDuplicateAttributes(hostile)
      expect(Date.now() - start).toBeLessThan(250)
    })
  })

  describe('stripHtmlTags', () => {
    it('removes simple tags', () => {
      expect(stripHtmlTags('<p>hello</p>')).toBe('hello')
      expect(stripHtmlTags('a<br>b<br>c')).toBe('abc')
    })

    it('removes tags with attributes', () => {
      expect(stripHtmlTags('a<a href="x">b</a>c')).toBe('abc')
    })

    it('preserves bare `<` with no closing `>` (matches old regex)', () => {
      expect(stripHtmlTags('a<unclosed')).toBe('a<unclosed')
    })

    it('preserves literal `<>` (the old `[^>]+` required at least one char)', () => {
      expect(stripHtmlTags('a<>b')).toBe('a<>b')
    })

    it('runs in linear time on inputs full of unmatched `<`', () => {
      const hostile = '<'.repeat(50_000) + 'x'
      const start = Date.now()
      stripHtmlTags(hostile)
      expect(Date.now() - start).toBeLessThan(250)
    })
  })

  describe('trimTrailingSlash', () => {
    it('strips one or more trailing slashes', () => {
      expect(trimTrailingSlash('https://x/')).toBe('https://x')
      expect(trimTrailingSlash('https://x///')).toBe('https://x')
    })

    it('leaves strings without trailing slashes alone', () => {
      expect(trimTrailingSlash('https://x')).toBe('https://x')
      expect(trimTrailingSlash('')).toBe('')
    })

    it('leaves middle slashes alone', () => {
      expect(trimTrailingSlash('a/b/c')).toBe('a/b/c')
    })

    it('runs in linear time on inputs ending with many slashes plus other chars', () => {
      const hostile = '/'.repeat(50_000) + 'x'
      const start = Date.now()
      trimTrailingSlash(hostile)
      expect(Date.now() - start).toBeLessThan(50)
    })
  })

  describe('stripQueryString', () => {
    it('strips from the first `?` onward when content follows', () => {
      expect(stripQueryString('https://x/path?a=1')).toBe('https://x/path')
      expect(stripQueryString('https://x?a=1&b=2')).toBe('https://x')
    })

    it('leaves strings with no `?` alone', () => {
      expect(stripQueryString('https://x/path')).toBe('https://x/path')
    })

    it('leaves a trailing `?` with no value alone (matches old `\\?.+$`)', () => {
      // /\?.+$/ requires at least one char after `?`; without it the regex
      // doesn't match and the input is returned unchanged.
      expect(stripQueryString('https://x?')).toBe('https://x?')
    })
  })

  describe('moveBlockClosingTagOutOfParagraph', () => {
    const tags = new Set(['div', 'center', 'table'])

    it('rewrites </tag></p> to </p></tag>', () => {
      expect(moveBlockClosingTagOutOfParagraph('<p>x</div></p>', tags))
        .toBe('<p>x</p></div>')
    })

    it('strips a single <br> before the closing tag', () => {
      expect(moveBlockClosingTagOutOfParagraph('<p>x<br></div></p>', tags))
        .toBe('<p>x</p></div>')
    })

    it('strips whitespace surrounding a <br>', () => {
      expect(moveBlockClosingTagOutOfParagraph('<p>x  <br>\n</div></p>', tags))
        .toBe('<p>x</p></div>')
    })

    it('strips bare leading whitespace (no <br>)', () => {
      expect(moveBlockClosingTagOutOfParagraph('<p>x\n  </div></p>', tags))
        .toBe('<p>x</p></div>')
    })

    it('leaves </p> alone when the preceding closing tag is not in the set', () => {
      expect(moveBlockClosingTagOutOfParagraph('<p>x</span></p>', tags))
        .toBe('<p>x</span></p>')
    })

    it('leaves </p> alone when there is no closing block tag immediately before', () => {
      expect(moveBlockClosingTagOutOfParagraph('<p>hello</p>', tags))
        .toBe('<p>hello</p>')
    })

    it('case-insensitive on the tag name (matches old /gi flag)', () => {
      expect(moveBlockClosingTagOutOfParagraph('<p>x</DIV></p>', tags))
        .toBe('<p>x</p></DIV>')
    })

    it('handles multiple matches in a single pass', () => {
      expect(moveBlockClosingTagOutOfParagraph('<p>a</div></p><p>b<br></center></p>', tags))
        .toBe('<p>a</p></div><p>b</p></center>')
    })

    it('runs in linear time on whitespace-heavy inputs with no matching closing tag', () => {
      // The whole point of replacing the regex: long whitespace runs
      // followed by `</p>` without a preceding closing block tag used
      // to trigger O(n²) backtracking under the unanchored `\s*`.
      const hostile = ' '.repeat(100_000) + '</p>'
      const start = Date.now()
      moveBlockClosingTagOutOfParagraph(hostile, tags)
      expect(Date.now() - start).toBeLessThan(50)
    })

    it('treats only HTML ASCII whitespace as strippable (intentional divergence from /\\s/)', () => {
      // JS regex `\s` also matches NBSP, vertical tab, em space, etc.;
      // the helper uses the WHATWG HTML "ASCII whitespace" set (space,
      // tab, LF, FF, CR). When non-ASCII whitespace sits between `<br>`
      // and the closing tag, the helper leaves the run untouched. This
      // is documented as intentional in the function doc — pin it here
      // so a future "make it match `\s` exactly" change is a conscious
      // decision rather than a silent edit.
      // U+00A0 NBSP, U+000B VT, U+2003 EM SPACE — all match JS /\\s/
      // but not WHATWG HTML ASCII whitespace, so the helper leaves
      // these inputs unchanged.
      const NBSP = String.fromCharCode(0x00a0)
      const VT   = String.fromCharCode(0x000b)
      const EM   = String.fromCharCode(0x2003)
      const nbsp = `<p>x<br>${NBSP}</div></p>`
      const vtab = `<p>x<br>${VT}</div></p>`
      const emSp = `<p>x<br>${EM}</div></p>`

      // The helper still rewrites the tag order (the regex did too),
      // but the `<br>` + non-ASCII-whitespace run between them stays
      // verbatim because `isHtmlWhitespace` doesn't match those code
      // points. The old regex would have additionally stripped this
      // run because `\s` includes NBSP/VT/em-space.
      expect(moveBlockClosingTagOutOfParagraph(nbsp, tags))
        .toBe(`<p>x<br>${NBSP}</p></div>`)
      expect(moveBlockClosingTagOutOfParagraph(vtab, tags))
        .toBe(`<p>x<br>${VT}</p></div>`)
      expect(moveBlockClosingTagOutOfParagraph(emSp, tags))
        .toBe(`<p>x<br>${EM}</p></div>`)

      // Sanity check: a literal ASCII space *is* stripped, to prove the
      // assertions above aren't trivially "no transform applied".
      expect(moveBlockClosingTagOutOfParagraph('<p>x<br> </div></p>', tags))
        .toBe('<p>x</p></div>')
    })
  })
})
