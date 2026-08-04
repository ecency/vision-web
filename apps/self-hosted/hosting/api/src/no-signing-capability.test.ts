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
        const name = entry.trim().split(/\s+as\s+/)[0].trim();
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

describe('the hosting API cannot sign a Hive transaction', () => {
  const files = sourceFiles(SRC);

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
