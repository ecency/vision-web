import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { AuthMethod } from '../types';
import {
  AUTH_METHODS,
  CONFIG_SAVING_METHODS,
  canSaveConfiguration,
  orderAuthMethods,
} from './auth-methods';

/**
 * The login page advertises configuring the site, so it must not lead with a
 * method that cannot save one.
 *
 * `getHostingToken` exchanges the current session for a managed-hosting token,
 * and it can only do that for a Hivesigner access token or an extension-signed
 * challenge. Every other session falls to `default` and throws, which surfaces
 * at save time: after the owner has signed in, opened the panel and made an
 * edit. Nothing in the type system connects that switch to the order the page
 * offers methods in, or to the sentence on the page that names them, so both
 * links are asserted here.
 *
 * Two properties, neither visible to the type checker:
 *
 *   1. `CONFIG_SAVING_METHODS` is exactly what `hosting-token.ts` handles. A
 *      method gaining or losing the capability has to move this list, which is
 *      what the ordering and the copy are derived from;
 *   2. no method that cannot save is offered before one that can.
 *
 * Nothing in `apps/self-hosted` is DOM-testable (`environment: 'node'`,
 * `include: ['src/**\/*.test.ts']`), so a source scan is the only guarantee
 * available for the first. Modelled on
 * `src/features/shared/hive-disclosure-guard.test.ts`.
 */

const SRC = join(__dirname, '..', '..', '..');

const HOSTING_TOKEN_MODULE = 'features/auth/utils/hosting-token.ts';
const I18N_MODULE = 'core/i18n.ts';

const HINT_KEY = 'login_owner_hint';

/**
 * What the hint has to call each method.
 *
 * Every method is named, whichever side of the capability line it is on: the
 * ones that save because the owner has to pick one, the ones that cannot
 * because the owner has to be warned before spending a session on it. A copy
 * rewrite that quietly drops one fails here.
 */
const HINT_NAMES: Record<AuthMethod, string> = {
  hivesigner: 'hivesigner',
  keychain: 'browser extension',
  hiveauth: 'hiveauth',
};

function parseSource(code: string, name = 'probe.ts'): ts.SourceFile {
  return ts.createSourceFile(
    name,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function parse(relative: string): ts.SourceFile {
  const path = join(SRC, relative);
  return parseSource(readFileSync(path, 'utf8'), path);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

interface SwitchShape {
  /** String-literal case labels, in source order. */
  cases: string[];
  /** Whether the switch has a default clause, and whether it throws. */
  hasDefault: boolean;
  defaultThrows: boolean;
}

/**
 * The shape of the switch on `discriminant`, read from the syntax tree.
 *
 * Read as case labels rather than as occurrences of the method names. The
 * module's own doc comment lists all three methods in prose, so any text search
 * for "hiveauth" in this file finds it and concludes the opposite of the truth.
 */
function switchOn(
  sf: ts.SourceFile,
  discriminant: string,
): SwitchShape | undefined {
  let shape: SwitchShape | undefined;

  walk(sf, (node) => {
    if (!ts.isSwitchStatement(node)) return;
    if (node.expression.getText(sf).replace(/\s+/g, '') !== discriminant) {
      return;
    }

    const cases: string[] = [];
    let hasDefault = false;
    let defaultThrows = false;

    for (const clause of node.caseBlock.clauses) {
      if (ts.isCaseClause(clause)) {
        if (
          ts.isStringLiteral(clause.expression) ||
          ts.isNoSubstitutionTemplateLiteral(clause.expression)
        ) {
          cases.push(clause.expression.text);
        } else {
          // A computed label is not readable here, and treating it as absent
          // would understate what the switch handles.
          cases.push(`<computed:${clause.expression.getText(sf)}>`);
        }
        continue;
      }
      hasDefault = true;
      for (const statement of clause.statements) {
        walk(statement, (inner) => {
          if (ts.isThrowStatement(inner)) defaultThrows = true;
        });
      }
    }

    shape = { cases, hasDefault, defaultThrows };
  });

  return shape;
}

/** The value of `key` in the given locale block of `i18n.ts`. */
function localeValue(
  sf: ts.SourceFile,
  locale: string,
  key: string,
): string | undefined {
  let value: string | undefined;

  walk(sf, (node) => {
    if (
      !ts.isVariableDeclaration(node) ||
      !ts.isIdentifier(node.name) ||
      node.name.text !== 'translations' ||
      !node.initializer ||
      !ts.isObjectLiteralExpression(node.initializer)
    ) {
      return;
    }
    for (const block of node.initializer.properties) {
      if (
        !ts.isPropertyAssignment(block) ||
        !ts.isIdentifier(block.name) ||
        block.name.text !== locale ||
        !ts.isObjectLiteralExpression(block.initializer)
      ) {
        continue;
      }
      for (const entry of block.initializer.properties) {
        if (
          ts.isPropertyAssignment(entry) &&
          entry.name &&
          ts.isIdentifier(entry.name) &&
          entry.name.text === key &&
          (ts.isStringLiteral(entry.initializer) ||
            ts.isNoSubstitutionTemplateLiteral(entry.initializer))
        ) {
          value = entry.initializer.text;
        }
      }
    }
  });

  return value;
}

describe('what can save a configuration change', () => {
  const hostingToken = parse(HOSTING_TOKEN_MODULE);
  const shape = switchOn(hostingToken, 'user.loginType');

  it('reads the session switch that mints the hosting token', () => {
    // Guards the reader: an undefined shape would make the next tests pass
    // vacuously or fail for the wrong reason.
    expect(shape).toBeDefined();
  });

  it('handles exactly the methods declared able to save', () => {
    expect([...shape!.cases].sort()).toEqual([...CONFIG_SAVING_METHODS].sort());
  });

  it('refuses every other session rather than saving silently', () => {
    expect(shape!.hasDefault).toBe(true);
    expect(shape!.defaultThrows).toBe(true);
  });

  it('leaves at least one method unable to save, which the copy must warn about', () => {
    // Not an aspiration: while this holds, the hint has a caveat to carry, and
    // the test below requires it to. If HiveAuth ever gains offline signing
    // this fails, which is the prompt to re-read the copy.
    const unable = AUTH_METHODS.filter((method) => !canSaveConfiguration(method));
    expect(unable).toEqual(['hiveauth']);
  });
});

describe('the page never offers a method that cannot finish the task first', () => {
  it('orders every saving method ahead of every non-saving one', () => {
    const ordered = orderAuthMethods(AUTH_METHODS);
    const violations: string[] = [];
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        if (!canSaveConfiguration(ordered[i]) && canSaveConfiguration(ordered[j])) {
          violations.push(`${ordered[i]} offered before ${ordered[j]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('holds for whatever subset an instance actually offers', () => {
    // The stock instance offers two of the three, and a config may name any
    // subset in any order. The invariant is about the output, not about the
    // one list the previous test happens to pass in.
    const subsets: AuthMethod[][] = [
      ['hiveauth', 'keychain'],
      ['keychain', 'hiveauth'],
      ['hiveauth', 'hivesigner'],
      ['hiveauth'],
      ['hiveauth', 'keychain', 'hivesigner'],
    ];
    for (const subset of subsets) {
      const ordered = orderAuthMethods(subset);
      const firstNonSaver = ordered.findIndex((m) => !canSaveConfiguration(m));
      if (firstNonSaver === -1) continue;
      const after = ordered.slice(firstNonSaver);
      expect(after.filter(canSaveConfiguration)).toEqual([]);
    }
  });

  it('puts the one method that both saves and works on a phone first', () => {
    expect(orderAuthMethods(AUTH_METHODS)[0]).toBe('hivesigner');
  });
});

describe('the hint names every method on the right side of the line', () => {
  const i18n = parse(I18N_MODULE);
  const hint = localeValue(i18n, 'en', HINT_KEY);

  it('finds the hint to check', () => {
    expect(hint).toBeDefined();
  });

  it.each(CONFIG_SAVING_METHODS)('names %s as a way to save', (method) => {
    expect(hint!.toLowerCase()).toContain(HINT_NAMES[method]);
  });

  it.each(AUTH_METHODS.filter((m) => !canSaveConfiguration(m)))(
    'warns that %s cannot save',
    (method) => {
      expect(hint!.toLowerCase()).toContain(HINT_NAMES[method]);
    },
  );

  it('does not claim the settings panel simply works once signed in', () => {
    // The sentence this replaced promised a settings button and stopped there,
    // which is what led an owner into a save they could not complete.
    expect(hint!.toLowerCase()).toMatch(/cannot save|only be saved/);
  });
});

describe('the guard catches the ways around it', () => {
  it('sees a case added for a method that cannot really save', () => {
    const sf = parseSource(
      [
        'function f(user: { loginType: string }) {',
        '  switch (user.loginType) {',
        "    case 'hivesigner': return 1;",
        "    case 'keychain': return 2;",
        "    case 'hiveauth': return 3;",
        '    default: throw new Error("no");',
        '  }',
        '}',
      ].join('\n'),
    );
    expect(switchOn(sf, 'user.loginType')!.cases).toEqual([
      'hivesigner',
      'keychain',
      'hiveauth',
    ]);
  });

  it('sees a case removed', () => {
    const sf = parseSource(
      [
        'function f(user: { loginType: string }) {',
        '  switch (user.loginType) {',
        "    case 'hivesigner': return 1;",
        '    default: throw new Error("no");',
        '  }',
        '}',
      ].join('\n'),
    );
    expect(switchOn(sf, 'user.loginType')!.cases).toEqual(['hivesigner']);
  });

  it('sees a default that returns instead of throwing', () => {
    const sf = parseSource(
      [
        'function f(user: { loginType: string }) {',
        '  switch (user.loginType) {',
        "    case 'keychain': return 2;",
        "    default: return '';",
        '  }',
        '}',
      ].join('\n'),
    );
    const shape = switchOn(sf, 'user.loginType')!;
    expect(shape.hasDefault).toBe(true);
    expect(shape.defaultThrows).toBe(false);
  });

  it('sees a switch with no default at all', () => {
    const sf = parseSource(
      [
        'function f(user: { loginType: string }) {',
        '  switch (user.loginType) {',
        "    case 'keychain': return 2;",
        '  }',
        '}',
      ].join('\n'),
    );
    expect(switchOn(sf, 'user.loginType')!.hasDefault).toBe(false);
  });

  it('does not read a switch on something else as the session switch', () => {
    const sf = parseSource(
      [
        'function f(x: { kind: string }) {',
        '  switch (x.kind) {',
        "    case 'hiveauth': return 3;",
        '  }',
        '}',
      ].join('\n'),
    );
    expect(switchOn(sf, 'user.loginType')).toBeUndefined();
  });

  it('does not let a prose mention of a method count as handling it', () => {
    // The real module's doc comment names all three. A text search would read
    // the opposite of the truth off it.
    const sf = parseSource(
      [
        '/** hivesigner, keychain and hiveauth are all mentioned here. */',
        'function f(user: { loginType: string }) {',
        '  switch (user.loginType) {',
        "    case 'keychain': return 2;",
        '    default: throw new Error("no");',
        '  }',
        '}',
      ].join('\n'),
    );
    expect(switchOn(sf, 'user.loginType')!.cases).toEqual(['keychain']);
  });

  it('reports an unreadable case label rather than skipping it', () => {
    const sf = parseSource(
      [
        'declare const K: string;',
        'function f(user: { loginType: string }) {',
        '  switch (user.loginType) {',
        '    case K: return 2;',
        '    default: throw new Error("no");',
        '  }',
        '}',
      ].join('\n'),
    );
    expect(switchOn(sf, 'user.loginType')!.cases).toEqual(['<computed:K>']);
  });

  it('reads a hint that dropped a method name', () => {
    const sf = parseSource(
      [
        'const translations = {',
        "  en: { login_owner_hint: 'Sign in with Hivesigner to save.' },",
        '};',
      ].join('\n'),
    );
    const hint = localeValue(sf, 'en', HINT_KEY)!;
    expect(hint.toLowerCase()).toContain('hivesigner');
    expect(hint.toLowerCase()).not.toContain('hiveauth');
  });
});
