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
 * from a Hivesigner access token or from a challenge signed by a browser
 * extension or the HiveAuth wallet. Every other session falls to `default` and
 * throws, which surfaces at save time: after the owner has signed in, opened
 * the panel and made an edit. Nothing in the type system connects that switch
 * to the order the page offers methods in, or to the sentence on the page, so
 * both links are asserted here.
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

/** Every locale block declared in `translations`, read from the source. */
function localeNames(sf: ts.SourceFile): string[] {
  const names: string[] = [];

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
      if (ts.isPropertyAssignment(block) && ts.isIdentifier(block.name)) {
        names.push(block.name.text);
      }
    }
  });

  return names;
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

  /**
   * This used to assert the opposite, that `hiveauth` could not save, and said
   * it was "the prompt to re-read the copy" if that ever changed. It did, in
   * #1356: `HAS.challenge` signs a string even though the wrapper cannot sign a
   * transaction offline, and a signed string is all this exchange needed.
   *
   * The copy was re-read. The hint no longer carries a caveat, in any locale,
   * because there is no longer a method to warn about, and the tests below that
   * demanded the warning are gone with it.
   */
  it('leaves no method unable to save, so the hint has nothing to warn about', () => {
    const unable = AUTH_METHODS.filter(
      (method) => !canSaveConfiguration(method),
    );
    expect(unable).toEqual([]);
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

  /**
   * The hint no longer needs to name the methods at all.
   *
   * It named them to steer an owner away from the one that could not finish.
   * With every method able to save, listing them would be a maintenance burden
   * that goes stale on the next protocol change and tells the owner nothing
   * they need before signing in.
   *
   * What it must NOT do is carry the old caveat, which is now false in every
   * locale and would send an owner to log in again for no reason.
   */
  it('no longer claims a method cannot save', () => {
    expect(hint!.toLowerCase()).not.toMatch(/cannot save|only be saved/);
  });

  it('still tells the owner what signing in lets them change', () => {
    // The sentence this guards replaced one that promised a settings button and
    // stopped there. Losing the caveat must not take the purpose with it.
    expect(hint!.toLowerCase()).toMatch(/title|logo|theme|layout/);
  });

  /**
   * Every locale, and the list is READ FROM THE SOURCE rather than written
   * here.
   *
   * A hand-kept list is the bug this whole series keeps naming, and it bit
   * here: the first version of this test enumerated five locales and the
   * caveat survived in the sixth, French, telling an owner their session
   * cannot do what it now does. Deriving the list means a locale added later
   * cannot dodge the guard either.
   */
  it('covers every locale the file declares', () => {
    // Guards the reader: an empty list would make the check below vacuous.
    const locales = localeNames(i18n);
    expect(locales.length).toBeGreaterThan(1);
    expect(locales).toContain('fr');
  });

  it('has no stale HiveAuth caveat in any locale', () => {
    const stale = localeNames(i18n).filter((locale) => {
      const text = localeValue(i18n, locale, HINT_KEY);
      return text !== undefined && text.toLowerCase().includes('hiveauth');
    });
    expect(stale).toEqual([]);
  });

  /**
   * Non-empty, not merely present. Deleting the caveat by emptying the whole
   * string satisfies the check above and leaves that locale's owner with no
   * hint at all; an earlier version of this test passed on exactly that.
   */
  it('still has a non-empty hint in every locale, so none was emptied instead', () => {
    const missing = localeNames(i18n).filter((locale) => {
      const text = localeValue(i18n, locale, HINT_KEY);
      return text === undefined || text.trim() === '';
    });
    expect(missing).toEqual([]);
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

/**
 * The HiveAuth branch, asserted on the source because the wrapper opens a
 * websocket and waits for a wallet, which no unit test can stand in for.
 *
 * Two things matter and neither is visible to the type checker: the key type
 * asked for has to be the one the server verifies against, and the value posted
 * as the signature has to be the field the wrapper actually returns it in.
 * Both were wrong in earlier drafts of this work elsewhere in the codebase.
 */
describe('the hiveauth branch signs what the server will accept', () => {
  const source = readFileSync(join(SRC, 'features/auth/utils/hive-auth.ts'), 'utf8');

  /**
   * The body of one named function, not the whole file.
   *
   * A file-wide search for `key_type: 'posting'` passes on this module no
   * matter what the signing call does, because `buildLoginChallenge` contains
   * the same literal. Changing the signing call to 'active' left that search
   * green, which is how this was caught.
   */
  function bodyOf(name: string): string {
    const sf = parseSource(source, 'hive-auth.ts');
    let text = '';
    walk(sf, (node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === name &&
        node.body
      ) {
        text = node.body.getText(sf);
      }
    });
    return text;
  }

  const signBody = bodyOf('signChallengeWithHiveAuth');

  it('finds the signing function to check', () => {
    // Guards the reader: an empty body would make every test below vacuous.
    expect(signBody).not.toBe('');
  });

  it('asks for the posting key', () => {
    // The server checks the signature against `account.posting.key_auths`, so
    // an active or memo signature verifies against nothing and the save fails
    // with a bare "Invalid signature".
    expect(signBody).toContain("key_type: 'posting'");
    expect(signBody).not.toContain("key_type: 'active'");
    expect(signBody).not.toContain("key_type: 'memo'");
  });

  it('returns data.challenge, which is the signature and not the string sent', () => {
    // The field name reads like the challenge that was submitted. It is the
    // signature over it; `data.pubkey` is the key. Confirmed against the
    // wrapper source and its README rather than against our own .d.ts.
    expect(signBody).toContain('response?.data?.challenge');
  });

  it('refuses an approved request that carried no signature', () => {
    // An empty ack is not a rejection, so without this it would surface as a
    // successful save that never authenticated.
    expect(signBody).toMatch(/no signature/i);
  });
});
