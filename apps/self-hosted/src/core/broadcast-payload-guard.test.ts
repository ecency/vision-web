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

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
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
  keys: string[];
}

/** Every object literal handed to a mutation call in one file. */
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
      if (isMutation && first && ts.isObjectLiteralExpression(first)) {
        const line =
          sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const keys = first.properties
          .map((property) =>
            property.name && !ts.isComputedPropertyName(property.name)
              ? property.name.getText(sf)
              : '<dynamic>',
          )
          .sort();
        found.push({ where: `${rel}:${line}`, keys });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return found;
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

  it('passes no options object to any mutation', () => {
    // `options` is what turns on the second operation. Absent, the operation
    // array is byte-identical to today's.
    const withOptions = payloads
      .filter((payload) => payload.keys.includes('options'))
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
      payload.keys.includes(COMMENT_PAYLOAD_MARKER),
    );

    // comment-form, use-publish-post, use-update-post.
    expect(commentPayloads.map((payload) => payload.where)).toHaveLength(3);
    for (const payload of commentPayloads) {
      expect(payload.keys, payload.where).toEqual(EXPECTED_PAYLOAD_KEYS);
    }
  });

  it('pins the SDK gate the absence of options relies on', () => {
    // If this ever stops gating, "no options key" stops meaning "no operation".
    const sdk = readFileSync(SDK_COMMENT, 'utf8');
    expect(sdk).toContain('if (payload.options)');
    const gate = sdk.indexOf('if (payload.options)');
    const builder = sdk.indexOf('buildCommentOptionsOp(');
    expect(gate).toBeGreaterThan(-1);
    expect(builder).toBeGreaterThan(gate);
  });
});
