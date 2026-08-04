import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The hosting API must not be able to sign a Hive transaction.
 *
 * Registering a self-hosted instance's Hivesigner redirect URI is an
 * `account_update2` broadcast under the app account's posting authority. This
 * service is internet-facing, it holds tenant data and payment records, and it
 * has never held a key of any kind. Putting one here to save a scheduled job is
 * exactly the change this guards against: the broadcast runs elsewhere, and
 * `/v1/internal/hivesigner/reconcile` only ever READS the chain.
 *
 * The check is on the import graph rather than on the presence of a word. A
 * module cannot sign what it cannot reach, so "no signing primitive is imported
 * anywhere in this package" states the capability directly. Comments and string
 * literals are removed first, so prose about signing (this file's own header
 * included) can never fail the build, and an import cannot be hidden inside one.
 *
 * Guards in this repository have false-passed by asserting something that was
 * never evaluated, so this one proves itself: the parser is exercised on a
 * fixture it must flag, and the walk is asserted to have reached real modules
 * with real imports before any conclusion is drawn from its silence.
 */

const SRC = path.join(import.meta.dirname, '.');

/**
 * Every name that could give a module a private key or push something signed with
 * one. `PrivateKey` holds one, `Transaction` signs with one, `Memo` encrypts with
 * one, and `callRPCBroadcast` is the only call that submits a signed transaction.
 *
 * `Signature` and `PublicKey` are deliberately absent and must stay absent.
 * Verifying a signature is a public operation that needs no key at all, and this
 * service does it on every hosting-token exchange: `utils/auth.ts` recovers the
 * signer of a login challenge to decide whether a session may save a config.
 * Listing them would make this guard fire on a keyless read, which teaches the
 * next person to weaken it rather than to think about it.
 */
const SIGNING_BINDINGS = new Set(['PrivateKey', 'Transaction', 'Memo', 'callRPCBroadcast']);

/** Modules whose whole purpose is signing or key handling. */
const SIGNING_MODULES = [/^@hiveio\/dhive$/, /^hive-tx/, /^hivesigner$/, /^secp256k1$/, /^bip39$/];

/**
 * Remove comments and string/template contents, leaving code structure intact.
 *
 * Written as a scanner rather than a regex because the two cheap alternatives are
 * both wrong in ways that matter here: stripping `//` to end of line eats the rest
 * of any line holding a `https://` literal, and not stripping at all lets a comment
 * that merely mentions an import fail the build.
 */
export function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (two === '/*') {
      i += 2;
      while (i < source.length && source.slice(i, i + 2) !== '*/') i++;
      i += 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      // The quotes are kept so an import specifier is still delimited; only what
      // is between them is dropped.
      out += ch;
      i++;
      let body = '';
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\\') {
          i += 2;
          body += ' ';
          continue;
        }
        body += source[i];
        i++;
      }
      // Specifiers are what the guard reads, so a plain (non-template, no escapes,
      // single-line) literal keeps its text; anything else is blanked.
      out += ch !== '`' && !body.includes('\n') ? body : '';
      out += ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export interface ModuleImport {
  specifier: string;
  bindings: string[];
}

/**
 * The imports of a module: the specifier, plus the local names bound from it.
 *
 * A namespace import binds every export of the module at once, so it is recorded
 * as `*` and judged on the specifier rather than on names it never spells out.
 */
export function parseImports(source: string): ModuleImport[] {
  const code = stripCommentsAndStrings(source);
  const found: ModuleImport[] = [];

  const statement = /\bimport\s+([\s\S]*?)\s+from\s*['"]([^'"]*)['"]/g;
  for (const match of code.matchAll(statement)) {
    const clause = match[1];
    const bindings: string[] = [];
    if (/\*\s+as\s+/.test(clause)) bindings.push('*');
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const entry of named[1].split(',')) {
        // An inline `type` modifier is part of the syntax, not part of the name.
        // Without stripping it, `import { type PrivateKey }` records the binding
        // as "type PrivateKey", which matches nothing and hides the import.
        const name = entry
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          .trim();
        if (name) bindings.push(name);
      }
    }
    const defaultBinding = clause.replace(/\{[\s\S]*?\}/, '').replace(/type\s+/, '').trim();
    const leading = defaultBinding.split(',')[0].trim();
    if (leading && !leading.startsWith('*')) bindings.push(leading);
    found.push({ specifier: match[2], bindings });
  }

  // Side-effect and dynamic imports bind nothing, but they still pull a module in.
  const bare = /\bimport\s*\(?\s*['"]([^'"]*)['"]\s*\)?/g;
  for (const match of code.matchAll(bare)) {
    if (!found.some((f) => f.specifier === match[1])) {
      found.push({ specifier: match[1], bindings: [] });
    }
  }

  return found;
}

/**
 * How many lines plainly begin an import statement.
 *
 * The scanner above is not a JavaScript lexer, and the gap it cannot close on
 * its own is a regex literal holding a quote: `/['"]/` is code, but the scanner
 * reads that apostrophe as the start of a string and swallows everything up to
 * the next one. Whatever it swallows is invisible to the guard, and an invisible
 * import is exactly the false pass this file exists to not have.
 *
 * So rather than pretend to lex, the guard checks its own sight. A line starting
 * with `import` is an import in any style this package is written in, and a
 * comment never starts one because it starts with a slash. If the parser reports
 * fewer than this counts, it lost something and the file is reported instead of
 * being quietly certified clean.
 */
export function plainImportLines(source: string): number {
  return (source.match(/^[ \t]*import[ \t(]/gm) ?? []).length;
}

/**
 * The modules whose imports the parser could not fully see.
 *
 * A function rather than a loop inside a test so it can be exercised on an input
 * that must be flagged. A loop that finds nothing passes whether or not it ran,
 * and a check nobody has ever seen fire is not a check.
 */
export function unreadableModules(sources: Iterable<[string, string]>): string[] {
  const out: string[] = [];
  for (const [name, source] of sources) {
    if (parseImports(source).length < plainImportLines(source)) out.push(name);
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('parseImports (the guard proves itself before it is trusted)', () => {
  it('flags a named signing import', () => {
    expect(parseImports("import { PrivateKey } from '@ecency/sdk/hive';")).toEqual([
      { specifier: '@ecency/sdk/hive', bindings: ['PrivateKey'] },
    ]);
  });

  it('flags a renamed signing import', () => {
    const [entry] = parseImports("import { PrivateKey as K, callRPC } from '@ecency/sdk/hive';");
    expect(entry.bindings).toContain('PrivateKey');
  });

  it('flags a namespace import, which binds every export at once', () => {
    expect(parseImports("import * as hive from 'hive-tx';")).toEqual([
      { specifier: 'hive-tx', bindings: ['*'] },
    ]);
  });

  it('flags a signing import behind an inline type modifier', () => {
    // A type-only import cannot sign anything on its own, and it is still
    // reported. Nothing in this package has a reason to name these types, so an
    // appearance is someone starting to write the code that does sign, which is
    // the moment this is meant to be discussed rather than after it works.
    const [entry] = parseImports("import { callRPC, type PrivateKey } from '@ecency/sdk/hive';");
    expect(entry.bindings).toContain('PrivateKey');
  });

  it('flags a wholly type-only signing import', () => {
    const [entry] = parseImports("import type { Transaction } from '@ecency/sdk/hive';");
    expect(entry.bindings).toContain('Transaction');
  });

  it('does not mangle the name of an ordinary inline type import', () => {
    const [entry] = parseImports("import { mapTenantFromDb, type Tenant } from '../types';");
    expect(entry.bindings).toEqual(expect.arrayContaining(['mapTenantFromDb', 'Tenant']));
  });

  it('flags a multi-line import clause', () => {
    const [entry] = parseImports("import {\n  callRPC,\n  Transaction,\n} from '@ecency/sdk/hive';");
    expect(entry.bindings).toContain('Transaction');
  });

  it('flags a dynamic import specifier', () => {
    expect(parseImports("const hs = await import('hivesigner');")).toEqual([
      { specifier: 'hivesigner', bindings: [] },
    ]);
  });

  it('does not read an import out of a comment', () => {
    expect(parseImports("// import { PrivateKey } from 'hive-tx';\nconst a = 1;")).toEqual([]);
    expect(parseImports("/* import { Transaction } from 'hive-tx'; */")).toEqual([]);
  });

  it('does not lose code that follows a URL in a comment or a string', () => {
    const code = "const rpc = 'https://api.example'; // see https://example/docs\nimport { PrivateKey } from 'hive-tx';";
    const [entry] = parseImports(code);
    expect(entry).toEqual({ specifier: 'hive-tx', bindings: ['PrivateKey'] });
  });
});

describe('plainImportLines (the guard checks its own sight)', () => {
  it('counts what the parser is expected to find', () => {
    const code = "import { a } from 'x';\nimport 'y';\nconst z = await import('w');\n";
    expect(plainImportLines(code)).toBe(2);
    expect(parseImports(code).length).toBeGreaterThanOrEqual(2);
  });

  it('does not count an import inside a comment', () => {
    expect(plainImportLines("// import { a } from 'x';\n")).toBe(0);
  });

  it('sees an import the scanner loses to a regex holding a quote', () => {
    // The scanner reads that apostrophe as a string opener and swallows the
    // import behind it. This is the case the cross-check exists for, so it is
    // asserted as a real divergence rather than described in a comment.
    const code = "const q = /['\"]/;\nimport { PrivateKey } from 'hive-tx';\n";
    expect(parseImports(code)).toEqual([]);
    expect(plainImportLines(code)).toBe(1);
  });

  it('flags the module whose imports were swallowed', () => {
    const blind = "const q = /['\"]/;\nimport { PrivateKey } from 'hive-tx';\n";
    expect(unreadableModules([['blind.ts', blind]])).toEqual(['blind.ts']);
  });

  it('does not flag a module the parser reads completely', () => {
    expect(unreadableModules([['ok.ts', "import { callRPC } from '@ecency/sdk/hive';\n"]])).toEqual(
      []
    );
  });
});

describe('the hosting API cannot sign a Hive transaction', () => {
  const files = sourceFiles(SRC);

  it('can see every import the package plainly contains', () => {
    // A file the parser cannot fully read is not a file it may certify. Anything
    // reported here is a scanner blind spot, not a signing import, but the guard
    // has to fail on it rather than conclude the module is clean.
    expect(
      unreadableModules(
        files.map((file) => [path.relative(SRC, file), readFileSync(file, 'utf-8')])
      )
    ).toEqual([]);
  });

  it('is looking at the real package, not an empty walk', () => {
    // Without this the whole suite passes when the walk finds nothing, which is
    // how a guard in this repository has silently stopped guarding before.
    expect(files.length).toBeGreaterThan(20);
    const specifiers = files.flatMap((f) =>
      parseImports(readFileSync(f, 'utf-8')).map((i) => i.specifier)
    );
    expect(specifiers).toContain('@ecency/sdk/hive');
    expect(specifiers.length).toBeGreaterThan(50);
  });

  it('imports no signing primitive anywhere', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const entry of parseImports(readFileSync(file, 'utf-8'))) {
        const bad = entry.bindings.filter((b) => SIGNING_BINDINGS.has(b));
        if (bad.length > 0) {
          offenders.push(`${path.relative(SRC, file)} imports ${bad.join(', ')}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('imports no signing or key-handling module anywhere', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const entry of parseImports(readFileSync(file, 'utf-8'))) {
        if (SIGNING_MODULES.some((re) => re.test(entry.specifier))) {
          offenders.push(`${path.relative(SRC, file)} imports ${entry.specifier}`);
        }
        // A namespace import of the SDK's hive entry point brings PrivateKey and
        // Transaction with it, whatever the module is called.
        if (entry.specifier === '@ecency/sdk/hive' && entry.bindings.includes('*')) {
          offenders.push(`${path.relative(SRC, file)} imports all of @ecency/sdk/hive`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
