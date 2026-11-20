import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'

// #2167. WorldMapPin is a Hive frontend: its user and post links open in Ecency.
let n = 0
const render = (body: string, forApp: boolean) =>
  markdown2Html({ author: 'wmp', permlink: `w${n++}`, last_update: '2026-11-21', body } as never, forApp)

describe('WorldMapPin links are internal (#2167)', () => {
  it.each([
    "<a href='http://worldmappin.com/@mers'>This user on Worldmappin</a>",
    'http://worldmappin.com/@mers',
    'https://worldmappin.com/@mers'
  ])('a user link opens the profile (%s)', (body) => {
    for (const forApp of [false, true]) {
      const html = render(body, forApp)
      expect(html).not.toContain('markdown-external-link')
      expect(html).toContain('markdown-author-link')
      expect(html).toMatch(/(?:href="\/@mers"|data-author="mers")/)
    }
  })

  it.each([
    '[x](https://worldmappin.com/@mers/hallstatt-a-fairytale-village)',
    'https://worldmappin.com/@mers/hallstatt-a-fairytale-village',
    '[x](https://worldmappin.com/travel/@mers/hallstatt-a-fairytale-village)'
  ])('a post link opens the post (%s)', (body) => {
    for (const forApp of [false, true]) {
      const html = render(body, forApp)
      expect(html).not.toContain('markdown-external-link')
      expect(html).toMatch(/(?:href="\/[a-z-]*\/?@mers\/hallstatt-a-fairytale-village"|data-permlink="hallstatt-a-fairytale-village")/)
    }
  })

  it('a /p/<permlink> link names no author and stays external', () => {
    for (const forApp of [false, true]) {
      expect(render("<a href='http://worldmappin.com/p/snowy-ascent-of-mount-mansfield'>post</a>", forApp)).toContain('markdown-external-link')
    }
  })
})
