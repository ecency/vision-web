import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No outbound link to somebody else's Hive frontend or explorer.
 *
 * We run our own for both jobs, so there is always an in-house destination:
 * ecency.com for content and hivexplorer.com for chain data. Sending a reader
 * to a competitor hands them an audience we just earned, and on a hosted blog
 * it does that from a site the owner is paying us to run.
 *
 * This is not hypothetical. `hive-post-note.tsx` hardcoded
 * `https://hivehub.dev/@${author}/${permlink}` for "View this post on Hive",
 * the single link on the page whose whole job is to send the reader somewhere
 * else, while author links in the same component tree already went to
 * ecency.com. It shipped to every hosted blog and was caught by the founder
 * reading the page, not by review.
 *
 * Scans source, not just the one file, because the next one will be somewhere
 * else.
 */

const SRC = join(__dirname, '..', '..');

/** Frontends and explorers that are not ours. */
const FOREIGN = [
  'hivehub.dev',
  'peakd.com',
  'hive.blog',
  'hiveblocks.com',
  'hiveblockexplorer.com',
  'ecency.waivio.com',
  'inleo.io',
  'liketu.com',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === 'node_modules' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

describe('outbound Hive links stay ours', () => {
  const files = sourceFiles(SRC);

  it('finds the sources to check', () => {
    // Guards the reader: an empty list would make the sweep vacuous.
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(FOREIGN)('links to no %s', (host) => {
    const offenders = files
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        // Comments explain WHY a host is not used, so they may name it.
        const code = source
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        return code.includes(host);
      })
      .map((file) => file.slice(SRC.length + 1));

    expect(offenders).toEqual([]);
  });

  /**
   * The detector has to detect. Without this the sweep passes on a reader that
   * finds nothing, which is the failure mode a source scan invites.
   */
  it('would catch a reintroduction', () => {
    const withLink = "const u = `https://hivehub.dev/@${a}/${p}`;";
    expect(withLink.includes('hivehub.dev')).toBe(true);
    const onlyComment = '// never link to hivehub.dev\nconst u = base + a;';
    const stripped = onlyComment.replace(/^\s*\/\/.*$/gm, '');
    expect(stripped.includes('hivehub.dev')).toBe(false);
  });
});
