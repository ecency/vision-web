import { readdirSync, readFileSync } from 'fs'
import { join, relative, resolve } from 'path'
import { describe, expect, it } from 'vitest'

// Safari before 16.4 cannot parse a regex lookbehind, and a regex literal fails
// when the script is parsed, so one lookbehind anywhere in the bundle stops all
// of render-helper from loading there (the same audience as the matchAll rule, #1701).
const src = resolve(__dirname)

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]
  )
}

describe('shipped render-helper source', () => {
  it('has no regex lookbehind', () => {
    const offenders = files(src)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.d.ts'))
      .filter((f) => /\(\?<[!=]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(src, f))
    expect(offenders).toEqual([])
  })
})
