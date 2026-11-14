import { describe, it, expect } from 'vitest'
import { entryKey } from './normalize-entry'

describe('entryKey', () => {
  it('is author/permlink, the one identity of a post across Hive API nodes', () => {
    expect(entryKey({ author: 'alice', permlink: 'wave-a' })).toBe('alice/wave-a')
  })
})
