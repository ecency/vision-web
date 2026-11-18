import { afterEach, describe, expect, it } from 'vitest'
import { createImageHTML } from './img.method'
import { getProxyBase, setProxyBase } from '../proxify-image-src'

// Every URL createImageHTML writes goes inside a double-quoted attribute, so a
// `"` in it (here from a configured proxy base) must come out as &quot;.
describe('createImageHTML attribute quoting', () => {
  const base = getProxyBase()
  afterEach(() => setProxyBase(base))

  it.each([true, false])('never ends an attribute early (forApp %s)', (forApp) => {
    setProxyBase('https://img.example.com/a"b')
    const html = createImageHTML('https://e.com/photo.png', false, forApp)
    expect(html).toContain('a&quot;b')
    expect(html).not.toContain('a"b')
  })

  it('leaves ordinary URLs as they were', () => {
    const html = createImageHTML('https://e.com/photo.png', false, false)
    expect(html).not.toContain('&quot;')
    expect(html).toContain('format=match&mode=fit')
  })
})
