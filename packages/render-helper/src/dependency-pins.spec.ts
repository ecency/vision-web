import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// The output boundary (src/methods/render-boundary.method.ts) depends on how
// these two read the same HTML. See "Output boundary" in the package README:
// a bump of either must re-run the differential fuzz and the corpus
// differential before this pin moves.
const require = createRequire(import.meta.url)

function installedVersion(pkg: string): string {
  let dir = dirname(require.resolve(pkg))
  for (;;) {
    try {
      const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      if (json.name === pkg) return json.version
    } catch {
      // keep walking up
    }
    const up = dirname(dir)
    if (up === dir) throw new Error(`package.json for ${pkg} not found`)
    dir = up
  }
}

describe('dependencies the output boundary relies on', () => {
  for (const [pkg, version] of [['@xmldom/xmldom', '0.9.12'], ['xss', '1.0.15']]) {
    it(`${pkg} is exactly ${version}`, () => {
      expect(
        installedVersion(pkg),
        `${pkg} changed: re-run the differential fuzz and corpus differential (README, "Output boundary") before updating this pin`
      ).toBe(version)
      const declared = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).dependencies[pkg]
      expect(declared, `${pkg} must be pinned exactly in package.json`).toBe(version)
    })
  }
})
