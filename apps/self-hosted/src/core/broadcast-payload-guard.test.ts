import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * A deploy may change what a visitor sees. It may never change what gets
 * signed.
 *
 * The Hive layer is a display layer. Nothing in it may cause a
 * `comment_options` operation to be broadcast, because such an operation is on
 * chain forever and cannot be edited afterwards. Exactly one thing in this app
 * may produce one: an author's own per post choice in the composer, and only
 * through `resolveCommentOptions`, which returns undefined for the selection
 * nobody touched.
 *
 * The mechanism it relies on is in the SDK: `use-comment.ts` gates the whole
 * second operation on `if (payload.options)`, so a payload whose `options` is
 * absent or undefined produces a byte-identical operation array. Both halves
 * are pinned here, the gate and what may appear at that key, because either one
 * alone is an assumption.
 *
 * The anchor is deliberate: `options` is a field of the payload passed to
 * `mutateAsync`, not an argument to `useComment`, whose second argument is
 * `{ adapter }`.
 *
 * Three rules this file holds itself to, because a guard that passes without
 * checking anything is worse than the defect it was written for:
 *
 *   - A payload it cannot read is a payload it cannot vouch for, so an
 *     uninspectable mutation argument FAILS rather than being skipped.
 *   - The SDK gate is asserted structurally, on the `if` statement that
 *     actually contains the builder call, never on the order two strings
 *     happen to appear in.
 *   - The one permitted `options` expression is checked by resolving its callee
 *     to an imported binding, not by the name written at the call site, so a
 *     local function borrowing the name does not inherit its permission.
 *
 * The analysis functions are exercised against synthetic sources at the bottom,
 * so each of those rules is demonstrated to catch its bypass rather than
 * asserted to.
 *
 * What the emitted operation actually contains is not asserted here, because
 * source shape cannot show it. `use-publish-post.broadcast.test.ts` runs the
 * hook and the SDK's own builder and compares operation arrays.
 */

const SRC = join(__dirname, '..');
const SDK_COMMENT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'sdk',
  'src',
  'modules',
  'posts',
  'mutations',
  'use-comment.ts',
);

/** Exactly the keys every comment payload in this app carries today. */
const EXPECTED_PAYLOAD_KEYS = [
  'author',
  'body',
  'jsonMetadata',
  'parentAuthor',
  'parentPermlink',
  'permlink',
  'title',
];

/** `parentAuthor` appears on the SDK's CommentPayload and on nothing else here. */
const COMMENT_PAYLOAD_MARKER = 'parentAuthor';

/** Fields that exist only to configure a `comment_options` operation. */
const OPTIONS_FIELDS = [
  'comment_options',
  'maxAcceptedPayout',
  'percentHbd',
  'allowVotes',
  'allowCurationRewards',
  'beneficiaries',
];

/**
 * The one module allowed to name those fields: the resolver that builds the
 * object, where every value is a literal a test can read and no config value
 * can reach. One door to the chain.
 */
const OPTIONS_BUILDER_FILE = 'src/core/hive-layer.ts';

/** The only function whose result may be handed to a payload's `options`. */
const OPTIONS_FACTORY = 'resolveCommentOptions';

/**
 * The only payload allowed to carry an `options` key at all.
 *
 * A comment reply must never acquire one: nothing in this app offers a reply
 * author a reward choice, so an `options` key appearing there would be a
 * decision taken on someone's behalf.
 */
const OPTIONS_CALL_SITES = ['src/features/publish/hooks/use-publish-post.ts'];

/** The truthiness test the absence of an `options` key relies on. */
const SDK_GATE = 'payload.options';
const SDK_BUILDER = 'buildCommentOptionsOp';

function sourceFiles(dir: string, into: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, into);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      into.push(path);
    }
  }
  return into;
}

function parseSource(code: string, name = 'probe.tsx'): ts.SourceFile {
  return ts.createSourceFile(
    name,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function parse(path: string): ts.SourceFile {
  return parseSource(readFileSync(path, 'utf8'), path);
}

/**
 * Local names that call a mutation.
 *
 * Covers `x.mutateAsync(...)` and the renamed form the publish bar uses,
 * `const { mutateAsync: publishPost } = usePublishPost()`, which a check on the
 * call text alone would miss entirely.
 */
function mutationAliases(sf: ts.SourceFile): Set<string> {
  const aliases = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isBindingElement(node) && node.propertyName) {
      const property = node.propertyName.getText(sf);
      if (
        (property === 'mutateAsync' || property === 'mutate') &&
        ts.isIdentifier(node.name)
      ) {
        aliases.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return aliases;
}

/**
 * Every name the file actually uses, comments excluded.
 *
 * Read off the syntax tree rather than by text search: a comment explaining why
 * a `comment_options` operation is never emitted must not fail the guard that
 * enforces it.
 */
function namesUsedIn(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) ||
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      names.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/**
 * Local name to the name it was imported under.
 *
 * The guard on the `options` expression resolves through this rather than
 * trusting the text at the call site. `import { resolveCommentOptions } from
 * '@/core/hive-layer'` and a local `function resolveCommentOptions()` read
 * identically at the call site and are not remotely the same thing.
 */
function importedBindings(sf: ts.SourceFile): Map<string, string> {
  const bindings = new Map<string, string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportSpecifier(node)) {
      const imported = (node.propertyName ?? node.name).getText(sf);
      bindings.set(node.name.getText(sf), imported);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return bindings;
}

/** What a payload wrote at its `options` key. */
type OptionsValue =
  | { kind: 'call'; callee: string; imported: string | null; text: string }
  | { kind: 'other'; text: string };

interface Payload {
  where: string;
  /** Path relative to `src`, for the call-site allowlist. */
  file: string;
  /**
   * The payload's own property names, or null when the argument is not
   * something this guard can read: an identifier, a call, a property access, a
   * spread, a computed key. Null is a failure, never a skip. `mutateAsync(p)`
   * hides an `options` key just as completely as writing one would add it, and
   * the walk would still find enough literals elsewhere to look busy.
   */
  keys: string[] | null;
  /** The argument as written, so a failure names the thing it could not read. */
  argument: string;
  /** The `options` expression, when the payload has one. */
  options?: OptionsValue;
}

/** Every payload handed to a mutation call in one file, readable or not. */
function payloadsIn(sf: ts.SourceFile, rel: string): Payload[] {
  const aliases = mutationAliases(sf);
  const bindings = importedBindings(sf);
  const found: Payload[] = [];

  const readOptions = (property: ts.ObjectLiteralElementLike): OptionsValue => {
    // A shorthand `{ options }` has no initializer to read, and neither does a
    // spread. Both land in `other`, which fails.
    if (!ts.isPropertyAssignment(property)) {
      return { kind: 'other', text: property.getText(sf).replace(/\s+/g, ' ') };
    }
    const value = property.initializer;
    const text = value.getText(sf).replace(/\s+/g, ' ');
    if (!ts.isCallExpression(value) || !ts.isIdentifier(value.expression)) {
      return { kind: 'other', text };
    }
    const callee = value.expression.text;
    return {
      kind: 'call',
      callee,
      imported: bindings.get(callee) ?? null,
      text,
    };
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      const isMutation =
        /(^|\.)mutateAsync$/.test(callee) ||
        /(^|\.)mutate$/.test(callee) ||
        aliases.has(callee);

      const [first] = node.arguments;
      if (isMutation) {
        const line =
          sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const where = `${rel}:${line}`;

        if (!first) {
          // No payload at all cannot carry an options key.
          found.push({ where, file: rel, keys: [], argument: '<no argument>' });
        } else if (!ts.isObjectLiteralExpression(first)) {
          found.push({
            where,
            file: rel,
            keys: null,
            argument: first.getText(sf).replace(/\s+/g, ' '),
          });
        } else {
          const keys: string[] = [];
          let readable = true;
          let options: OptionsValue | undefined;
          for (const property of first.properties) {
            // Anything without a name this guard can read: a spread, which
            // carries whatever the spread object carries including `options`,
            // or a computed key, which is a name only known at runtime. One
            // check covers both because a SpreadAssignment has no `name` node
            // at all.
            if (!property.name || ts.isComputedPropertyName(property.name)) {
              readable = false;
              break;
            }
            const name = property.name.getText(sf);
            keys.push(name);
            if (name === 'options') options = readOptions(property);
          }
          found.push({
            where,
            file: rel,
            keys: readable ? keys.sort() : null,
            argument: first.getText(sf).replace(/\s+/g, ' '),
            options,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return found;
}

interface GateReport {
  /** Every call to the builder, by line. */
  total: string[];
  /** Those genuinely inside the then-branch of `if (<gate>)`. */
  gated: string[];
}

/**
 * Where the builder is called, and whether the gate really contains the call.
 *
 * Structural on purpose. The previous version compared `indexOf` positions, so
 * an unconditional call after an unrelated `if (payload.options)` statement, or
 * after a comment that merely mentioned one, satisfied it. This walks up from
 * each call to see whether an `if` whose expression IS the gate has the call in
 * its `thenStatement`, which is the only arrangement that actually prevents the
 * operation from being emitted.
 */
function gateReport(
  sf: ts.SourceFile,
  gateText: string,
  builderName: string,
): GateReport {
  const report: GateReport = { total: [], gated: [] };

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sf) === builderName
    ) {
      const at = `${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
      report.total.push(at);

      let current: ts.Node = node;
      let parent: ts.Node | undefined = node.parent;
      while (parent) {
        if (
          ts.isIfStatement(parent) &&
          parent.expression.getText(sf) === gateText &&
          // the else branch does the opposite of gating
          parent.thenStatement === current
        ) {
          report.gated.push(at);
          break;
        }
        current = parent;
        parent = parent.parent;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return report;
}

describe('no deploy of this layer changes a broadcast payload', () => {
  const payloads = sourceFiles(SRC).flatMap((path) =>
    payloadsIn(parse(path), path.replace(SRC, 'src')),
  );

  it('finds the mutation payloads it is meant to be checking', () => {
    // Without this the whole suite passes vacuously the moment the walk stops
    // matching, which is how a guard quietly stops guarding.
    expect(payloads.length).toBeGreaterThanOrEqual(4);
  });

  it('can read every mutation payload in the app', () => {
    // A payload this guard cannot inspect is a payload it cannot vouch for.
    const opaque = payloads
      .filter((payload) => payload.keys === null)
      .map((payload) => `${payload.where} -> ${payload.argument}`);
    expect(opaque).toEqual([]);
  });

  it('passes an options object from exactly one place', () => {
    // `options` is what turns on the second operation. Everywhere else its
    // absence keeps the operation array byte-identical to today's.
    const withOptions = payloads
      .filter((payload) => payload.keys?.includes('options'))
      .map((payload) => payload.file);
    expect([...new Set(withOptions)].sort()).toEqual([...OPTIONS_CALL_SITES]);
  });

  it('builds every options object through the one resolver', () => {
    // Read off the expression, not off the name at the call site: the callee
    // has to resolve to an imported binding whose original name is the
    // resolver's. A locally declared function of the same name is a different
    // function and does not inherit its permission.
    const offenders = payloads
      .filter((payload) => payload.options)
      .filter(
        (payload) =>
          payload.options?.kind !== 'call' ||
          payload.options.imported !== OPTIONS_FACTORY,
      )
      .map((payload) => `${payload.where} -> options: ${payload.options?.text}`);
    expect(offenders).toEqual([]);
  });

  it('names a comment_options field in exactly one module', () => {
    // Elsewhere in the app these names have no legitimate use, and in that one
    // module every value is a literal this suite reads.
    const offenders: string[] = [];
    for (const path of sourceFiles(SRC)) {
      const rel = path.replace(SRC, 'src');
      if (rel === OPTIONS_BUILDER_FILE) continue;
      const names = namesUsedIn(parse(path));
      for (const field of OPTIONS_FIELDS) {
        if (names.has(field)) offenders.push(`${rel}:${field}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never writes a beneficiary into the options it builds', () => {
    // A beneficiary rewrites who gets paid. Seeding one on an author's behalf
    // is not something this app may ever do, so the only value allowed at that
    // key is an empty array literal, checked on the syntax tree rather than by
    // trusting the resolver's unit test to keep looking at the same thing.
    const sf = parse(join(SRC, ...OPTIONS_BUILDER_FILE.split('/').slice(1)));
    const written: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isPropertyAssignment(node) &&
        node.name.getText(sf) === 'beneficiaries'
      ) {
        const value = node.initializer;
        const empty =
          ts.isArrayLiteralExpression(value) && value.elements.length === 0;
        if (!empty) written.push(value.getText(sf).replace(/\s+/g, ' '));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(written).toEqual([]);
  });

  it('pins the exact key set of every comment payload', () => {
    // Any new key on a payload that becomes a `comment` operation has to be
    // looked at, not only an `options` one.
    const commentPayloads = payloads.filter((payload) =>
      payload.keys?.includes(COMMENT_PAYLOAD_MARKER),
    );

    // comment-form, use-publish-post, use-update-post.
    expect(commentPayloads.map((payload) => payload.where)).toHaveLength(3);
    for (const payload of commentPayloads) {
      const allowed = OPTIONS_CALL_SITES.includes(payload.file)
        ? [...EXPECTED_PAYLOAD_KEYS, 'options'].sort()
        : EXPECTED_PAYLOAD_KEYS;
      expect(payload.keys, payload.where).toEqual(allowed);
    }
  });

  it('leaves the edit path with no options key at all', () => {
    // Editing a post cannot change its reward settings: `comment_options` is
    // written once and is not editable afterwards, so an `options` key here
    // would be a control that silently does nothing, or worse, one that
    // rebroadcasts a different split the author never chose.
    const edit = payloads.filter((payload) =>
      payload.file.includes('use-update-post'),
    );
    expect(edit).not.toHaveLength(0);
    for (const payload of edit) {
      expect(payload.keys, payload.where).toEqual(EXPECTED_PAYLOAD_KEYS);
    }
  });

  it('pins the SDK gate the absence of options relies on', () => {
    // If this ever stops gating, "no options key" stops meaning "no operation".
    const report = gateReport(parse(SDK_COMMENT), SDK_GATE, SDK_BUILDER);
    expect(report.total.length).toBeGreaterThan(0);
    expect(report.gated).toEqual(report.total);
  });
});

describe('the guard catches the ways around it', () => {
  const payloadsOf = (code: string) => payloadsIn(parseSource(code), 'probe');
  const gateOf = (code: string) =>
    gateReport(parseSource(code, 'probe.ts'), SDK_GATE, SDK_BUILDER);

  it('reads a plain object literal', () => {
    const [payload] = payloadsOf('m.mutateAsync({ author: a, options: o });');
    expect(payload.keys).toEqual(['author', 'options']);
  });

  it('accepts the resolver call, imported, however it is spelled locally', () => {
    for (const code of [
      "import { resolveCommentOptions } from '@/core/hive-layer';\nm.mutateAsync({ author: a, options: resolveCommentOptions(s) });",
      // Aliased on import: a different name at the call site, the same
      // function. The binding is what is checked, so this passes.
      "import { resolveCommentOptions as ro } from '@/core/hive-layer';\nm.mutateAsync({ author: a, options: ro(s) });",
    ]) {
      const [payload] = payloadsOf(code);
      expect(payload.options?.kind, code).toBe('call');
      expect(
        payload.options?.kind === 'call' ? payload.options.imported : null,
        code,
      ).toBe('resolveCommentOptions');
    }
  });

  it.each([
    [
      'a local function wearing the resolver name',
      'function resolveCommentOptions(s) { return { percentHbd: 0 }; }\nm.mutateAsync({ options: resolveCommentOptions(s) });',
    ],
    [
      'an object literal written inline',
      "m.mutateAsync({ options: { maxAcceptedPayout: '0.000 HBD' } });",
    ],
    [
      'a variable holding one',
      'm.mutateAsync({ options: chosenOptions });',
    ],
    [
      'a shorthand property',
      'm.mutateAsync({ author, options });',
    ],
    [
      'a conditional around the resolver',
      "import { resolveCommentOptions } from '@/core/hive-layer';\nm.mutateAsync({ options: x ? resolveCommentOptions(s) : { percentHbd: 0 } });",
    ],
    [
      'a method call that merely looks right',
      "import { resolveCommentOptions } from '@/core/hive-layer';\nm.mutateAsync({ options: helpers.resolveCommentOptions(s) });",
    ],
  ])('refuses %s', (_label, code) => {
    const [payload] = payloadsOf(code);
    const accepted =
      payload.options?.kind === 'call' &&
      payload.options.imported === 'resolveCommentOptions';
    expect(accepted).toBe(false);
  });

  it('refuses an identifier argument instead of ignoring it', () => {
    // The hole: `mutateAsync(payload)` skipped every assertion below while the
    // walk still found enough literals elsewhere for the suite to pass.
    for (const code of [
      'm.mutateAsync(payload);',
      'm.mutateAsync(options.payload);',
      'm.mutateAsync(buildPayload());',
      'm.mutate(payload as CommentPayload);',
    ]) {
      const [payload] = payloadsOf(code);
      expect(payload, code).toBeDefined();
      expect(payload.keys, code).toBeNull();
    }
  });

  it('refuses a literal whose keys it cannot enumerate', () => {
    // A spread or a computed key hides `options` exactly as well as an
    // identifier does.
    for (const code of [
      'm.mutateAsync({ ...base, title: t });',
      'm.mutateAsync({ [key]: value, title: t });',
    ]) {
      const [payload] = payloadsOf(code);
      expect(payload.keys, code).toBeNull();
    }
  });

  it('refuses an aliased mutation with an unreadable argument', () => {
    const [payload] = payloadsOf(
      'const { mutateAsync: publish } = usePublishPost(); publish(payload);',
    );
    expect(payload.keys).toBeNull();
  });

  it('accepts a call with no payload at all', () => {
    const [payload] = payloadsOf('m.mutate();');
    expect(payload.keys).toEqual([]);
  });

  it('accepts the builder only inside the real gate', () => {
    const gated = gateOf(
      'function f(payload) { if (payload.options) { ops.push(buildCommentOptionsOp(a)); } }',
    );
    expect(gated.total).toHaveLength(1);
    expect(gated.gated).toEqual(gated.total);
  });

  it.each([
    [
      'an unrelated gate statement earlier in the file',
      'function f(payload) { if (payload.options) { log(1); } ops.push(buildCommentOptionsOp(a)); }',
    ],
    [
      'a comment that merely mentions the gate',
      'function f(payload) { /* if (payload.options) */ ops.push(buildCommentOptionsOp(a)); }',
    ],
    [
      'the builder in the else branch',
      'function f(payload) { if (payload.options) { log(1); } else { ops.push(buildCommentOptionsOp(a)); } }',
    ],
    [
      'a weakened gate that lets null through',
      'function f(payload) { if (payload.options !== undefined) { ops.push(buildCommentOptionsOp(a)); } }',
    ],
    [
      'no gate at all',
      'function f(payload) { ops.push(buildCommentOptionsOp(a)); }',
    ],
  ])('reports the builder as ungated with %s', (_label, code) => {
    // Every one of these passed the previous subtext-ordering check.
    const report = gateOf(code);
    expect(report.total).toHaveLength(1);
    expect(report.gated).toEqual([]);
  });
});
