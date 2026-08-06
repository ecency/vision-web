import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
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

/**
 * A file's code with comments removed, via the TypeScript scanner.
 *
 * Regex stripping cannot do this. Removing whole-line `//` misses a TRAILING
 * one, so `const u = base + a; // never link to hivehub.dev` still reported an
 * offender, and widening the regex to any `//` eats the `//` inside every
 * `https://` URL in the file. The scanner knows which is which because it knows
 * where strings and comments actually start.
 */
function codeOf(file: string): string {
  const source = readFileSync(file, 'utf8');
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    file.endsWith('.tsx') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    source,
  );

  let out = '';
  let kind = scanner.scan();
  while (kind !== ts.SyntaxKind.EndOfFileToken) {
    if (
      kind !== ts.SyntaxKind.SingleLineCommentTrivia &&
      kind !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      out += scanner.getTokenText();
    }
    kind = scanner.scan();
  }
  return out;
}

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
      .filter((file) => codeOf(file).includes(host))
      .map((file) => file.slice(SRC.length + 1));

    expect(offenders).toEqual([]);
  });

  /**
   * The detector has to detect. Without this the sweep passes on a reader that
   * finds nothing, which is the failure mode a source scan invites.
   */
  it('reads code and ignores comments, including trailing ones', () => {
    const probe = join(SRC, '__scanner_probe.ts');
    writeFileSync(
      probe,
      [
        '// leading: never link to hivehub.dev',
        'const a = "https://ecency.com/@x"; // trailing: not peakd.com either',
        '/* block: nor hive.blog */',
        'const b = a;',
      ].join('\n'),
    );
    try {
      const code = codeOf(probe);
      // All three comment forms gone, including the trailing one, which a
      // line-anchored regex leaves behind.
      expect(code).not.toContain('hivehub.dev');
      expect(code).not.toContain('peakd.com');
      expect(code).not.toContain('hive.blog');
      // And the `//` inside a real URL survives, which is what stops a blunter
      // strip from being an option.
      expect(code).toContain('https://ecency.com/@x');
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
