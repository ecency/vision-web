import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The community feed must go through the SDK's ranked-posts query.
 *
 * That query is where DMCA post filtering and tag sanitisation happen. This app
 * used to call bridge.get_ranked_posts itself, which skipped both, so
 * takedown-listed content was served on instances Ecency operates. Nothing in
 * the type system distinguishes the two, so the direct call is checked for
 * here: it is a one-line change to reintroduce and nothing else would notice.
 */

const SRC = join(__dirname, '..', '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (entry.name.endsWith('.test.ts')) return [];
    return [path];
  });
}

/** The method name as it appears in a call, so prose about it does not match. */
const DIRECT_CALL = /['"`]bridge\.get_ranked_posts['"`]/;

describe('community feed data source', () => {
  it('makes no ranked-posts bridge call of its own', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => DIRECT_CALL.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(SRC, 'src'));

    expect(offenders).toEqual([]);
  });

  it('reads real source files', () => {
    // Guards the sweep itself: a broken path would make the check above pass
    // over an empty list forever.
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((file) => file.endsWith('blog-posts-list.tsx'))).toBe(
      true,
    );
  });
});
