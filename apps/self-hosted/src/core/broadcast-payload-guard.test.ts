import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * A deploy may change what a visitor sees. It may never change what gets
 * signed.
 *
 * This layer is a display layer. Nothing in it may cause a `comment_options`
 * operation to be broadcast where one is not broadcast today, because a
 * `comment_options` op is on chain forever and cannot be edited afterwards.
 *
 * The mechanism it relies on is in the SDK: `use-comment.ts` gates the whole
 * second operation on `if (payload.options)`, so a payload without that key
 * produces a byte-identical operation array. Both halves are pinned here, the
 * gate and the absence of the key, because either one alone is an assumption.
 *
 * The anchor is deliberate: `options` is a field of the payload passed to
 * `mutateAsync`, not an argument to `useComment`, whose second argument is
 * `{ adapter }`.
 *
 * Two rules this file holds itself to, because a guard that passes without
 * checking anything is worse than the defect it was written for:
 *
 *   - A payload it cannot read is a payload it cannot vouch for, so an
 *     uninspectable mutation argument FAILS rather than being skipped.
 *   - The SDK gate is asserted structurally, on the `if` statement that
 *     actually contains the builder call, never on the order two strings
 *     happen to appear in.
 *
 * The analysis functions are exercised against synthetic sources at the bottom,
 * so each of those rules is demonstrated to catch its bypass rather than
 * asserted to.
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

interface Payload {
  where: string;
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
}

/** Every payload handed to a mutation call in one file, readable or not. */
function payloadsIn(sf: ts.SourceFile, rel: string): Payload[] {
  const aliases = mutationAliases(sf);
  const found: Payload[] = [];

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
          found.push({ where, keys: [], argument: '<no argument>' });
        } else if (!ts.isObjectLiteralExpression(first)) {
          found.push({
            where,
            keys: null,
            argument: first.getText(sf).replace(/\s+/g, ' '),
          });
        } else {
          const keys: string[] = [];
          let readable = true;
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
            keys.push(property.name.getText(sf));
          }
          found.push({
            where,
            keys: readable ? keys.sort() : null,
            argument: first.getText(sf).replace(/\s+/g, ' '),
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

  it('passes no options object to any mutation', () => {
    // `options` is what turns on the second operation. Absent, the operation
    // array is byte-identical to today's.
    const withOptions = payloads
      .filter((payload) => payload.keys?.includes('options'))
      .map((payload) => payload.where);
    expect(withOptions).toEqual([]);
  });

  it('never uses a comment_options field anywhere in the app', () => {
    const offenders: string[] = [];
    for (const path of sourceFiles(SRC)) {
      const names = namesUsedIn(parse(path));
      for (const field of OPTIONS_FIELDS) {
        if (names.has(field))
          offenders.push(`${path.replace(SRC, 'src')}:${field}`);
      }
    }
    expect(offenders).toEqual([]);
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
