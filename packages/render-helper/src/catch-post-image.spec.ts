import { catchPostImage, getEntryImageRawUrl } from './catch-post-image'
import { markdown2Html } from './markdown-2-html'
import { buildPictureSources, proxifyImageSrc } from './proxify-image-src'

// The feature's central invariant: the LCP <link rel="preload"> the entry page
// builds from getEntryImageRawUrl + buildPictureSources must byte-match the avif
// <source> the in-body <picture> (markdown2Html forApp=false) actually requests
// — otherwise the high-priority preload is wasted and the LCP image
// double-downloads. Encoded / non-ASCII cover URLs are the regression-prone case.
describe('LCP preload avif URL matches the in-body <picture> avif source', () => {
  const firstAvif = (ss: string) => ss.split(',')[0].trim().split(/\s+/)[0].replace(/&amp;/g, '&')
  const bodyAvif = (entry: any): string | null => {
    const m = markdown2Html(entry, false).match(/<source type="image\/avif" srcset="([^"]+)"/)
    return m ? firstAvif(m[1]) : null
  }
  const preloadAvif = (entry: any): string | null => {
    const raw = getEntryImageRawUrl(entry)
    const p = raw ? buildPictureSources(raw) : null
    return p ? firstAvif(p.avif) : null
  }
  const urls: Record<string, string> = {
    ascii: 'https://files.peakd.com/x/a.png',
    'percent-encoded': 'https://files.peakd.com/x/my%20pic.png',
    'non-ascii (cyrillic)': 'https://files.peakd.com/x/%D1%84%D0%B0%D0%B9%D0%BB.png',
    'amp-encoded query': 'https://files.peakd.com/x/a.png?w=1&amp;h=2'
  }
  let i = 0
  for (const [label, url] of Object.entries(urls)) {
    // distinct permlink per case — the entry render cache keys on author/permlink
    const permlink = `inv-${i++}`
    it(`matches for a ${label} cover URL`, () => {
      const entry = {
        author: 'a', permlink, last_update: '2019-05-10T09:15:21',
        body: `text ![x](${url}) more`, json_metadata: '{}'
      } as any
      const b = bodyAvif(entry)
      expect(b).not.toBeNull()
      expect(preloadAvif(entry)).toBe(b)
    })
  }

  it('matches for a bare-text image URL cover (no markdown syntax, no json_metadata thumbnail)', () => {
    const entry = {
      author: 'a', permlink: 'inv-bare', last_update: '2019-05-10T09:15:21',
      body: 'lead in\n\nhttps://files.peakd.com/x/bare-cover.png\n\ntrailing', json_metadata: '{}'
    } as any
    const b = bodyAvif(entry)
    expect(b).not.toBeNull()
    expect(preloadAvif(entry)).toBe(b)
  })

  it('matches for an [url](url) image-link cover', () => {
    const u = 'https://files.peakd.com/x/link-cover.png'
    const entry = {
      author: 'a', permlink: 'inv-link', last_update: '2019-05-10T09:15:21',
      body: `lead in\n\n[${u}](${u})\n\ntrailing`, json_metadata: '{}'
    } as any
    const b = bodyAvif(entry)
    expect(b).not.toBeNull()
    expect(preloadAvif(entry)).toBe(b)
  })
})

// #1802. Every proxify in getImage used to fall back to the ORIGINAL dimensions
// when the source was a .gif, so a feed card asking for a 600x500 thumbnail was
// handed the full file: 1.5 MB into a 150px slot, and the largest LCP cost on
// /trending. The image host resizes animated sources now (ecency/imagehoster#47),
// so the size is asked for like any other. These pin that it stays asked for.
describe('a gif cover is sized like any other cover', () => {
  const sized = (url: string, mdKey: string) =>
    catchPostImage({
      author: 'a', permlink: `gif-${mdKey}`, last_update: '2019-05-10T09:15:21',
      body: 'x', json_metadata: JSON.stringify({ image: [url] })
    } as any, 600, 500, 'match')

  it('carries the requested box for a gif in json_metadata.image', () => {
    const out = sized('https://files.peakd.com/x/animation.gif', 'meta')
    expect(out).toContain('width=600')
    expect(out).toContain('height=500')
  })

  it('carries it for a gif named by json_metadata.thumbnails, which wins over image', () => {
    const out = catchPostImage({
      author: 'a', permlink: 'gif-thumb', last_update: '2019-05-10T09:15:21',
      body: 'x',
      json_metadata: JSON.stringify({
        thumbnails: ['https://files.peakd.com/x/thumb.gif'],
        image: ['https://files.peakd.com/x/cover.png']
      })
    } as any, 600, 500, 'match')
    // The /p/ hash is the only thing naming the chosen source, so compare
    // against the URL the thumbnail would build on its own.
    expect(out).toBe(proxifyImageSrc('https://files.peakd.com/x/thumb.gif', 600, 500, 'match'))
    expect(out).toContain('width=600')
    expect(out).toContain('height=500')
  })

  it('carries it for a gif found in the body', () => {
    const out = catchPostImage({
      author: 'a', permlink: 'gif-body', last_update: '2019-05-10T09:15:21',
      body: 'intro ![x](https://files.peakd.com/x/body.gif) more', json_metadata: '{}'
    } as any, 600, 500, 'match')
    expect(out).toContain('width=600')
    expect(out).toContain('height=500')
  })

  it('builds the same URL it would for the same source as a png', () => {
    const gif = sized('https://files.peakd.com/x/same.gif', 'same-gif')
    const png = sized('https://files.peakd.com/x/same.png', 'same-png')
    const strip = (u: string | null) => (u || '').replace(/\/p\/[^?]+/, '/p/<hash>')
    expect(strip(gif)).toBe(strip(png))
  })

  it('still honours an explicit 0x0 request', () => {
    const out = sized('https://files.peakd.com/x/unsized.gif', 'unsized')
    expect(out).toContain('width=600')
    const zero = catchPostImage({
      author: 'a', permlink: 'gif-zero', last_update: '2019-05-10T09:15:21',
      body: 'x', json_metadata: JSON.stringify({ image: ['https://files.peakd.com/x/unsized.gif'] })
    } as any, 0, 0, 'match')
    expect(zero).not.toContain('width=')
  })
})

describe('getEntryImageRawUrl', () => {
  it('returns the raw (un-proxified) json_metadata.image[0]', () => {
    const entry = {
      author: 'a', permlink: 'p', last_update: '2019-05-10T09:15:21',
      body: 'no images here',
      json_metadata: JSON.stringify({ image: ['https://files.peakd.com/x/cover.png'] })
    } as any
    expect(getEntryImageRawUrl(entry)).toBe('https://files.peakd.com/x/cover.png')
  })

  it('falls back to the first body image when json_metadata has none', () => {
    const entry = {
      author: 'a', permlink: 'p', last_update: '2019-05-10T09:15:21',
      body: 'intro ![x](https://files.peakd.com/x/body.jpg) more',
      json_metadata: '{}'
    } as any
    expect(getEntryImageRawUrl(entry)).toBe('https://files.peakd.com/x/body.jpg')
  })

  it('captures a standalone bare-text image URL as the first body image', () => {
    const entry = {
      author: 'a', permlink: 'p', last_update: '2019-05-10T09:15:21',
      body: 'lead in\n\nhttps://files.peakd.com/x/cover.png\n\ntrailing',
      json_metadata: '{}'
    } as any
    expect(getEntryImageRawUrl(entry)).toBe('https://files.peakd.com/x/cover.png')
  })

  // A bare URL on a line of its own before a markdown image is the first
  // image the render shows (#2185).
  it('names a bare URL that comes before a markdown image', () => {
    const entry = {
      author: 'a', permlink: 'p', last_update: '2019-05-10T09:15:21',
      body: 'https://files.peakd.com/x/first.png\n\n![a](https://files.peakd.com/x/second.png)',
      json_metadata: '{}'
    } as any
    expect(getEntryImageRawUrl(entry)).toBe('https://files.peakd.com/x/first.png')
  })

  it('does NOT capture an image-extension URL inside a [label](href) link (avoids false-positive preload)', () => {
    const entry = {
      author: 'a', permlink: 'p', last_update: '2019-05-10T09:15:21',
      body: '[click here](https://files.peakd.com/x/not-a-cover.png) and some text',
      json_metadata: '{}'
    } as any
    expect(getEntryImageRawUrl(entry)).toBeNull()
  })

  it('captures an [url](url) image-link cover (label equals href, href is an image)', () => {
    const u = 'https://files.peakd.com/x/cover.png'
    const entry = {
      author: 'a', permlink: 'p', last_update: '2019-05-10T09:15:21',
      body: `lead in\n\n[${u}](${u})\n\ntrailing`, json_metadata: '{}'
    } as any
    expect(getEntryImageRawUrl(entry)).toBe(u)
  })

  it('does NOT capture a [label](href) link whose label differs from href (reference link, not an image)', () => {
    const entry = {
      author: 'a', permlink: 'p', last_update: '2019-05-10T09:15:21',
      body: '[https://files.peakd.com/x/other.png](https://files.peakd.com/x/a.png) text',
      json_metadata: '{}'
    } as any
    expect(getEntryImageRawUrl(entry)).toBeNull()
  })

  it('returns null when no image is found', () => {
    const entry = {
      author: 'a', permlink: 'p', last_update: '2019-05-10T09:15:21',
      body: 'just text', json_metadata: '{}'
    } as any
    expect(getEntryImageRawUrl(entry)).toBeNull()
  })

  it('returns null for a parenthesized markdown image URL (MD fast-path bails) — the entry page must then skip the match preload, not preload it against the body avif <picture>', () => {
    const entry = {
      author: 'a', permlink: 'p', last_update: '2019-05-10T09:15:21',
      body: '![x](https://example.com/foo_(bar).jpg)', json_metadata: '{}'
    } as any
    expect(getEntryImageRawUrl(entry)).toBeNull()
  })

  it('works on a raw markdown string', () => {
    expect(getEntryImageRawUrl('![x](https://files.peakd.com/x/s.webp)')).toBe('https://files.peakd.com/x/s.webp')
  })

  it('he-decodes fast-path body image URLs (no &amp; leakage into the proxy hash)', () => {
    const entry = {
      author: 'a', permlink: 'p', last_update: '2019-05-10T09:15:21',
      body: 'pre ![x](https://files.peakd.com/x/a.png?w=1&amp;h=2) post',
      json_metadata: '{}'
    } as any
    expect(getEntryImageRawUrl(entry)).toBe('https://files.peakd.com/x/a.png?w=1&h=2')
    expect(getEntryImageRawUrl('![x](https://files.peakd.com/x/a.png?w=1&amp;h=2)')).toBe('https://files.peakd.com/x/a.png?w=1&h=2')
  })
})

describe('catchPostImage', () => {
  describe('extracting from json_metadata', () => {
    it('should extract first image from json_metadata image array', () => {
    const input = {
      author: 'foo1',
      permlink: 'bar1',
      json_metadata:
        '{"tags":["auto","vehicle","ai","technology","adsactly"],"users":["adsactly","techblogger","adsactly-witness"],"image":["http://www.autonews.com/apps/pbcsi.dll/storyimage/CA/20180205/MOBILITY/180209919/AR/0/AR-180209919.jpg","http://clipart-library.com/images/pco56kbxi.png","http://psipunk.com/wp-content/uploads/2010/03/phoenix-electric-car-futuristic-concept-01.jpg","https://images.hgmsites.net/med/2011-honda-small-sports-ev-concept_100369472_m.jpg","https://cdn.trendhunterstatic.com/thumbs/electric-car-concept.jpeg","https://s.aolcdn.com/hss/storage/midas/162bec06fe31386c2a36ad6ca4d7f01d/205983934/lg-here-self-driving-car-partnership.jpg","https://i.ecency.com/DQmd5CQG5zLjjm2z8289qcLU6eBHJpC5FmgtR3aC1eXnhsi/Adsactly-Logo-200px.png","https://i.ecency.com/0x0/https://i.ecency.com/DQmWK9ACVoywHPBJQdoTuJpoTSoaubBSKSAdZaJtw1cfLb9/adsactlywitness.gif"],"links":["https://qzprod.files.wordpress.com/2018/02/kelly-sikkema-266805.jpg?quality=80&strip=all&w=3200","http://psipunk.com/wp-content/uploads/2010/03/phoenix-electric-car-futuristic-concept-01.jpg","https://images.hgmsites.net/med/2011-honda-small-sports-ev-concept_100369472_m.jpg","https://cdn.trendhunterstatic.com/thumbs/electric-car-concept.jpeg","https://s.aolcdn.com/hss/storage/midas/162bec06fe31386c2a36ad6ca4d7f01d/205983934/lg-here-self-driving-car-partnership.jpg","https://discord.gg/EwGhEzb","https://steemit.com/witness-category/@adsactly-witness/adsactly-steemit-witness-proposal","https://steemit.com/~witnesses","https://v2.steemconnect.com/sign/account-witness-vote?witness=adsactly-witness&approve=1"],"app":"steemit/0.1","format":"markdown"}',
      body: '',
      last_update: '2019-05-10T09:15:21'
    }

    const expected = 'https://i.ecency.com/p/2N61tysBoFrHXFxZDViD89h3bB1XeSgVQ4AKkLUBP2yqmAVL2ZqehqfzwxCQq2g82mHjH9LZV4ugYdmL4TbpNqAoc5LaDDRVPYNurZeK7HpTFq6fjtFG1s9ZpXZWuCufpLhZsDw1G1wL?format=match&mode=fit'

    expect(catchPostImage(input)).toBe(expected)
    })

    it('should extract image URL from json_metadata with busy app format', () => {
    const input = {
      author: 'foo2',
      permlink: 'bar2',
      json_metadata:
        '{"community":"busy","app":"busy/2.3.0","format":"markdown","users":["gavvet","kingscrown","vcelier","ezzy","meesterboom","thecryptodrive","reggaemuffin","adsactly","adsactly-witness","buildteam","minnowbooster","steemvoter","steemsports"],"links":["https://imgur.com/NUt92kg","/@gavvet","/@kingscrown","/@vcelier","/@ezzy","/@meesterboom","/@thecryptodrive","/@reggaemuffin","/@adsactly","/@adsactly-witness"],"image":["https://i.ecency.com/0x0/https://i.imgur.com/NUt92kg.jpg","https://i.ecency.com/0x0/https://i.ecency.com/DQmXndfFUQmmtMk5Dd6u1nRNmNqr2mdkEGDVkT9SNyCxEeP/bt%20logo.png","https://i.ecency.com/0x0/https://i.ecency.com/DQmd5CQG5zLjjm2z8289qcLU6eBHJpC5FmgtR3aC1eXnhsi/Adsactly-Logo-200px.png"],"tags":["art","photography","adsactly","thoughts","busy"]}',
      body: '',
      last_update: '2019-05-10T09:15:21'
    }

    const expected = 'https://i.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgnAvKo1Rap9w75mXk?format=match&mode=fit'

    expect(catchPostImage(input)).toBe(expected)
    })

    it('should return null when json_metadata has no image field', () => {
    const input = {
      author: 'foo3',
      permlink: 'bar3',
      json_metadata:
        '{"video":{"info":{"title":"HEALTHY SERIES | LUNCH | STUFFED AUBERGINE BOATS - VIDEO ","snaphash":"QmdbBjr9bhab392f2zkXsa7YhHue7YNch2J1XXzvhLEE6V","author":"allasyummyfood","permlink":"qe5nlzmj","duration":172.384943,"filesize":26936060,"spritehash":"QmSG49VefmCQqWVjb8ii79GQVuSSKrFrUNSh45gni5Kqhq"},"content":{"videohash":"QmRkNLhhBjr86YB21ZpD76A1jCDt7stCAMeNpWgxNYRmUs","video480hash":"QmP3S6piVPRuriPmQZRbPPHGYG5aKYjukFP8vWWcW349VQ","magnet":"","description":"How to make stuffed eggplant. Looking for a flavorful dinner? Then try this baked eggplant dish that\'s stuffed with vegetables and spices. Make the most of whole aubergines - turn them into edible bowls. Serve these stuffed aubergines as a light dinner along with a big salad. This is very hearty and nutritious dish.\\n\\nIngredients \\n\\n\\n1 large aubergine\\n1 cup - 200 gr of chopped canned tomato\\n1 tsp of turmeric and 1tsp of cumin\\nhalf an onion\\n2 cloves of garlic\\nbunch of parsley\\nsalt & pepper\\nsour cream ( optional)\\n\\nDirections \\n\\nStep 1: Preheat your oven to 180 C or 350 F.\\nStep 2 : Cut your eggplant in half, make few cuts along and then across. \\nStep 3 : Place your eggplant onto a baking dish, blush them with olive oil or use low calorie cooking spray. \\nStep 4 : Cook your eggplant for 30-35 min. \\nStep 5 : In a small saucepan, place your chopped onion and garlic. Fry for 3 -5 min untill soft. Add turmeric and cumin. Then add chopped tomatoes, \\nStep 6 : Scoop the mixture from your eggplant very carefully without breaking the skin. \\nStep 7 : Add the eggplant flesh into your pan along with parsley and cook for 15 min on low heat.\\nStep 8 : Fill your eggplant boats and serve with some fresh sour cream. \\n\\nMore videos on @dtube!!! :))) Alla \\n","tags":["dtube","video","food","recipe"]},"_id":"d46a5cfac370f095a54e6aa088656d7e"},"tags":["dtube","video","food","recipe","dtube"],"app":"dtube/0.6"}',
      body: '',
      last_update: '2019-05-10T09:15:21'
    }
    expect(catchPostImage(input)).toBe(null)
    })

    it('should extract image from new post style with image object', () => {
      const input = {
        'json_metadata': {
          'image': ['https://files.peakd.com/file/peakd-hive/aggroed/agtirkG8-image.png', 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwww.adafruit.com%2Fblog%2Fwp-content%2Fuploads%2F2014%2F04%2Fgeordi-la-forge-600x458.jpg&amp;f=1&amp;nofb=1']
        }
      }

      const expected = 'https://i.ecency.com/p/hgjbks2vRxvf3xsYr6qQ7dm31DuBHGui8pKMdEVPxhLfEeEoVMPfUw4Z6QduNMpLay65R9vadbefhmDKmhM6HD8w8a?format=match&mode=fit'

      expect(catchPostImage(input as any)).toBe(expected)
    })

    it('should return empty string when image field contains nested arrays', () => {
      const input = {
        author: 'foo-10',
        permlink: 'bar-baz-10',
        json_metadata: {
          image: [
            [
              '![](https://cdn.steemitimages.com/DQmecSNtkk82zz62rymdK7wvXujn5P47zkARUMR13QLXmya/image.png)'
            ]
          ]
        }
      }
      expect(catchPostImage(input as any)).toBe('')
    })

    it('should extract image when image field is a string', () => {
      const input = {
        'json_metadata': {
          'image': 'https://files.peakd.com/file/peakd-hive/aggroed/agtirkG8-image.png'
        }
      }
      const expected = 'https://i.ecency.com/p/hgjbks2vRxvf3xsYr6qQ7dm31DuBHGui8pKMdEVPxhLfEeEoVMPfUw4Z6QduNMpLay65R9vadbefhmDKmhM6HD8w8a?format=match&mode=fit'
      expect(catchPostImage(input as any)).toBe(expected)
    })
  })

  describe('extracting from body content', () => {
    it('should extract image from image link in body', () => {
    const input = {
      author: 'foo4',
      permlink: 'bar4',
      json_metadata: '{}',
      body: '<center>https://ipfs.io/ipfs/aa.png</center><hr>',
      last_update: '2019-05-10T09:15:21'
    }

    const expected = 'https://i.ecency.com/p/F7pXcna7voXwGzRSmsevszxeTZTcnhJVu7akN?format=match&mode=fit'

    expect(catchPostImage(input)).toBe(expected)
    })

    it('should extract image from HTML img tag', () => {
    const input = {
      author: 'foo5',
      permlink: 'bar5',
      body:
        '<center><a href=\'https://d.tube/#!/v/theaudgirl/2ys21z9c\'><img src=\'https://ipfs.io/ipfs/QmaG5Dpg1XGiY7EyeMCwT8Dqw4GfiAaehq3hZadongniQc\'></a></center><hr>',
      last_update: '2019-05-10T09:15:21'
    }

    const expected = 'https://i.ecency.com/p/46aP2QbqUqBqwzwxM6L1P6uLNceBDDCMCT7ReED4mRE2QxpU6UqBLE8rB5qCFGv3PRxu6pX61M3gUWVEEkTHbKBUQ2Kc?format=match&mode=fit'

    expect(catchPostImage(input)).toBe(expected)
    })

    it('should extract image from markdown image syntax', () => {
    const input = {
      author: 'foo6',
      permlink: 'bar6',
      json_metadata: '{}',
      body:
        '<center>![ezrni9y9pw.jpg](https://img.esteem.ws/ezrni9y9pw.jpg)</center><hr>',
      last_update: '2019-05-10T09:15:21'
    }

    const expected = 'https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMxpZmncLuDWMUeztZaUN?format=match&mode=fit'

    expect(catchPostImage(input)).toBe(expected)
    })

    it('should return null when no images found in body', () => {
    const input = {
      author: 'foo7',
      permlink: 'bar7',
      json_metadata: '{}',
      body: '<p>lorem ipsum dolor</p> sit amet',
      last_update: '2019-05-10T09:15:21'
    }

    expect(catchPostImage(input)).toBe(null)
    })

    it('should extract image when input is a string instead of object', () => {
    const input = '<center>![ezrni9y9pw.jpg](https://img.esteem.ws/ezrni9y9pw.jpg)</center><hr>'
    const expected = 'https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMxpZmncLuDWMUeztZaUN?format=match&mode=fit'

    expect(catchPostImage(input)).toBe(expected)
    })

    it('should ignore image syntax inside fenced code blocks', () => {
      // The ![code](fake) is inside ``` and must NOT be selected as the post image.
      // The real image follows the code block.
      const input = {
        author: 'foo-fence',
        permlink: 'bar-fence',
        json_metadata: '{}',
        body: 'See this code:\n\n```\n![code](https://fake.example.com/x.jpg)\n```\n\nReal image: ![real](https://img.esteem.ws/ezrni9y9pw.jpg)',
        last_update: '2019-05-10T09:15:21'
      }
      const result = catchPostImage(input)
      expect(result).toContain('https://i.ecency.com/p/')
      expect(result).not.toContain('fake.example.com')
    })

    it('should ignore image syntax inside inline code', () => {
      const input = {
        author: 'foo-inline',
        permlink: 'bar-inline',
        json_metadata: '{}',
        body: 'Inline: `![nope](https://fake.example.com/x.jpg)` then ![ok](https://img.esteem.ws/ezrni9y9pw.jpg)',
        last_update: '2019-05-10T09:15:21'
      }
      const result = catchPostImage(input)
      expect(result).not.toContain('fake.example.com')
    })

    it('should respect source order between HTML and markdown images', () => {
      // <img> appears first in the body, so the full DOM's first <img> would
      // be the HTML one. The fast-path must agree.
      const orderedBody = '<img src="https://img.esteem.ws/first.jpg"> then ![alt](https://img.esteem.ws/second.jpg)'
      const onlyHtml = '<img src="https://img.esteem.ws/first.jpg">'
      expect(catchPostImage(orderedBody)).toBe(catchPostImage(onlyHtml))
    })

    it('should fall back when markdown URL contains unbalanced parens', () => {
      // `[^)\s]+` would truncate `path_(a)_full.jpg` mid-paren. The fast-path
      // must bail so the full parser handles balanced parens correctly. The
      // observable signal: the result must not be a hash of the truncated
      // prefix `https://example.com/path_(a` (the empty-parens form).
      const truncatedHash = catchPostImage('![](https://example.com/path_(a)')
      const balancedResult = catchPostImage({
        author: 'foo-paren',
        permlink: 'bar-paren',
        json_metadata: '{}',
        body: '![alt](https://example.com/path_(a)_full.jpg)',
        last_update: '2019-05-10T09:15:21'
      } as any)
      expect(balancedResult).not.toBe(truncatedHash)
    })

    it('should not match broken markdown without a closing paren', () => {
      // `![alt](url` (no close) is not a valid markdown image. The fast-path
      // must skip it, fall back to the full parser, which won't find an image.
      const input = {
        author: 'foo-broken',
        permlink: 'bar-broken',
        json_metadata: '{}',
        body: '![alt](https://example.com/incomplete and more text on the same line',
        last_update: '2019-05-10T09:15:21'
      }
      expect(catchPostImage(input)).toBe(null)
    })

    it('should not surface ftp: URLs (the sanitizer drops them)', () => {
      // Verified by calling renderPostBody — the full path renders <img alt
      // /> with no src for ftp images, so catchPostImage must agree.
      expect(catchPostImage('![x](ftp://example.com/a.jpg)')).toBe(null)
    })

    it('should ignore image syntax inside ~~~ tilde fences', () => {
      const input = {
        author: 'foo-tilde',
        permlink: 'bar-tilde',
        json_metadata: '{}',
        body: '~~~\n![code](https://fake.example.com/x.jpg)\n~~~\n\n![real](https://img.esteem.ws/ezrni9y9pw.jpg)',
        last_update: '2019-05-10T09:15:21'
      }
      const result = catchPostImage(input)
      expect(result).not.toContain('fake.example.com')
    })

    it('should ignore image syntax inside indented code blocks', () => {
      const input = {
        author: 'foo-indent',
        permlink: 'bar-indent',
        json_metadata: '{}',
        body: 'Code:\n\n    ![code](https://fake.example.com/x.jpg)\n\nReal: ![real](https://img.esteem.ws/ezrni9y9pw.jpg)',
        last_update: '2019-05-10T09:15:21'
      }
      const result = catchPostImage(input)
      expect(result).not.toContain('fake.example.com')
    })

    it('should not surface javascript: or data: URLs from the fast-path', () => {
      // Fast-path bypasses sanitize-html. A malicious post with a dangerous
      // src must not be returned wrapped in a proxy URL. The regex skips it
      // and the fallback markdown render strips it via sanitize-html.
      const jsInput = {
        author: 'foo-js',
        permlink: 'bar-js',
        json_metadata: '{}',
        body: '<img src="javascript:alert(1)"> and ![ok](https://img.esteem.ws/ezrni9y9pw.jpg)',
        last_update: '2019-05-10T09:15:21'
      }
      const jsResult = catchPostImage(jsInput)
      expect(jsResult ?? '').not.toContain('javascript')

      const dataInput = {
        author: 'foo-data',
        permlink: 'bar-data',
        json_metadata: '{}',
        body: '![nope](data:image/png;base64,iVBORw0KGgo=) ![ok](https://img.esteem.ws/ezrni9y9pw.jpg)',
        last_update: '2019-05-10T09:15:21'
      }
      const dataResult = catchPostImage(dataInput)
      expect(dataResult ?? '').not.toContain('data:image')
    })
  })
})

describe('markdown image/link scan is linear (ReDoS regression)', () => {
  // `X.repeat(n)` with no closing `)` is the attack: with unbounded label/href quantifiers,
  // matchAll/match re-scan to the end of the body at every `[`, making these O(n^2) on
  // untrusted post content (seconds at this size). The length-bounded quantifiers cap the
  // per-position scan, so it stays sub-quadratic. getEntryImageRawUrl runs MD_IMAGE_RE +
  // MD_LINK_RE and never falls back to the full parser, so it isolates the regex cost.
  const N = 16_000
  it.each([
    ['unclosed [ run', '['.repeat(N) + 'x'],
    ['[a]( repetition (MD_LINK href)', '[a]('.repeat(N)],
    ['![a]( repetition (MD_IMAGE href)', '![a]('.repeat(N)]
  ])('handles pathological %s without quadratic blowup', (_label, body) => {
    const start = Date.now()
    const result = getEntryImageRawUrl(body)
    const elapsed = Date.now() - start
    expect(result).toBeNull()
    // N-scaled cap so the linearity claim stays falsifiable as N changes (the enforcing
    // guard is the regexp/no-super-linear-move eslint rule); quadratic here is ~7s at 16k.
    expect(elapsed).toBeLessThan(N * 0.15)
  })

  it('still detects a real [url](url) cover after unclosed-bracket noise', () => {
    const u = 'https://files.peakd.com/x/cover.png'
    expect(getEntryImageRawUrl(`[[[ noise\n\n[${u}](${u})`)).toBe(u)
  })

  it('keeps the first image whose URL contains a bracketed query param', () => {
    // A literal `[` in the URL (e.g. an array-style query) must not skip the first image in
    // favour of a later one — the earlier bracket-excluding fix regressed exactly this.
    const first = 'https://files.peakd.com/x/a.png?w[]=600'
    const body = `![first](${first})\n\n![second](https://files.peakd.com/x/b.png)`
    expect(getEntryImageRawUrl(body)).toBe(first)
  })

  it('bails (not a later image) when the first markdown image URL exceeds the length bound', () => {
    // A > 2048-char first image URL leaves it uncaptured by MD_IMAGE_RE; because that regex is
    // unanchored it may instead capture a later markdown image, so verify neither a later <img>
    // NOR a later markdown image wins. getEntryImageRawUrl (no fallback) returns null so the
    // caller falls back; catchPostImage falls back and resolves the real first image.
    const longUrl = 'https://files.peakd.com/x/' + 'a'.repeat(2100) + '.png'
    const body =
      `![first](${longUrl})\n\n` +
      `<img src="https://files.peakd.com/x/later-html.png">\n\n` +
      `![later-md](https://files.peakd.com/x/later-md.png)`
    expect(getEntryImageRawUrl(body)).toBeNull()
    // The render drops an image the proxy refuses for its length and shows the
    // next one (#2182): the card names that one, never the later markdown.
    const cp = catchPostImage(body) ?? ''
    expect(cp).toBe(proxifyImageSrc('https://files.peakd.com/x/later-html.png', 0, 0, 'match'))
  })
})
