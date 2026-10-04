import { bitchuteThumbnailUrl, setBitchuteThumbnailOrigin } from './bitchute-thumbnail'

describe('bitchute thumbnail origin', () => {
  afterEach(() => setBitchuteThumbnailOrigin(''))

  it('builds a cover URL only for an https origin and an alphanumeric id', () => {
    expect(bitchuteThumbnailUrl('1abYMl7gW68')).toBeNull()

    setBitchuteThumbnailOrigin('https://ecency.com/')
    expect(bitchuteThumbnailUrl('1abYMl7gW68')).toBe(
      'https://ecency.com/api/bitchute-thumbnail/1abYMl7gW68'
    )
    expect(bitchuteThumbnailUrl('abc123def')).toBe(
      'https://ecency.com/api/bitchute-thumbnail/abc123def'
    )
  })

  it('rejects an origin or id that could change the request', () => {
    setBitchuteThumbnailOrigin('http://ecency.com')
    expect(bitchuteThumbnailUrl('1abYMl7gW68')).toBeNull()

    setBitchuteThumbnailOrigin('https://ecency.com/extra')
    expect(bitchuteThumbnailUrl('1abYMl7gW68')).toBeNull()

    setBitchuteThumbnailOrigin('https://ecency.com')
    expect(bitchuteThumbnailUrl('../etc')).toBeNull()
    expect(bitchuteThumbnailUrl('id with space')).toBeNull()
    expect(bitchuteThumbnailUrl('')).toBeNull()
  })
})
