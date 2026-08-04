import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCommentOp, buildCommentOptionsOp } from '@ecency/sdk';
import type { AuthorRewards, RewardType } from '@/core/hive-layer';

/**
 * What this app actually broadcasts when an author presses publish.
 *
 * Not a description of it. The real `usePublishPost` runs, with only the auth,
 * router and config edges replaced, and the payload it hands to the SDK is
 * captured. That payload is then fed through the SDK's own operations builder,
 * lifted out of `use-comment.ts` by the TypeScript compiler and executed with
 * the SDK's real operation builders, so the arrays compared below are the
 * arrays that would be signed.
 *
 * The property that matters: for an author who does not touch the reward
 * control, the operation array is byte-for-byte the one this app broadcast
 * before the control existed. That is asserted by building the same post twice,
 * once with the `options` key this PR added and once with it removed, and
 * comparing the serialised results. A `comment_options` operation cannot be
 * edited or removed once it is on chain, which is why this is a test rather
 * than a code review promise.
 *
 * Lifting the builder out of the SDK rather than reimplementing it is
 * deliberate. A local copy of the `if (payload.options)` gate would pass
 * whatever the SDK did, including the day it stops gating.
 */

const SDK_COMMENT = join(
  __dirname,
  '..',
  '..',
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

/** Captured payloads, in call order, filled by the mocked `useComment`. */
const captured: Record<string, unknown>[] = [];
/** Drives the resolver clamp without going near a config document. */
let authorRewards: AuthorRewards = 'author';

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@tanstack/react-query',
  );
  return {
    ...actual,
    // The hook body is the thing under test, so it is run directly rather than
    // through a React render. `mutateAsync` is wired to the real `mutationFn`.
    useMutation: (options: { mutationFn: (variables: unknown) => unknown }) => ({
      ...options,
      mutateAsync: (variables: unknown) => options.mutationFn(variables),
    }),
  };
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => undefined,
}));

vi.mock('@ecency/sdk', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ecency/sdk');
  return {
    ...actual,
    // Only the broadcast edge is replaced. The payload is kept exactly as the
    // hook built it, and the SDK's real builders stay available above.
    useComment: () => ({
      mutateAsync: async (payload: Record<string, unknown>) => {
        captured.push(payload);
        return { id: 'tx' };
      },
    }),
  };
});

vi.mock('@/features/auth/hooks', () => ({
  useAuth: () => ({ user: { username: 'alice' } }),
}));

vi.mock('@/features/blog/hooks/use-instance-config', () => ({
  useInstanceConfig: () => ({ isCommunityMode: false, communityId: undefined }),
}));

vi.mock('@/features/blog/hooks/use-hive-layer', () => ({
  useHiveLayer: () => ({ authorRewards }),
}));

vi.mock('@/providers/sdk', () => ({
  createBroadcastAdapter: () => ({}),
}));

type Operation = [string, Record<string, unknown>];

/**
 * The SDK's own payload-to-operations function, extracted and made callable.
 *
 * `useBroadcastMutation(mutationKey, username, operations, ...)` receives it as
 * its third argument and calls it as `const ops = operations(payload)`, so this
 * function IS the operation array. Extracting it by position rather than by
 * text means a rewrite of the SDK surfaces here as a failure to find it, not as
 * a stale copy that keeps passing.
 */
function extractSdkOperationsBuilder(): (
  payload: Record<string, unknown>,
) => Operation[] {
  const source = ts.createSourceFile(
    SDK_COMMENT,
    readFileSync(SDK_COMMENT, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  let builder: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'useBroadcastMutation'
    ) {
      builder = node.arguments[2];
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (!builder) {
    throw new Error(
      'could not find the operations builder passed to useBroadcastMutation',
    );
  }

  const js = ts.transpileModule(`(${builder.getText(source)})`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
    },
  }).outputText;

  // The two builders are the only free names in that function. Injecting the
  // SDK's real ones means the arrays below carry real operation objects.
  return new Function(
    'buildCommentOp',
    'buildCommentOptionsOp',
    `return ${js}`,
  )(buildCommentOp, buildCommentOptionsOp);
}

/** Every name `use-comment.ts` destructures out of `payload.options`. */
function sdkOptionFields(): string[] {
  const source = ts.createSourceFile(
    SDK_COMMENT,
    readFileSync(SDK_COMMENT, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const fields: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer?.getText(source) === 'payload.options' &&
      ts.isObjectBindingPattern(node.name)
    ) {
      for (const element of node.name.elements) {
        fields.push(element.name.getText(source));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return fields;
}

const buildOperations = extractSdkOperationsBuilder();

/** Run the real hook body for one reward selection and return its payload. */
async function publish(rewardType: RewardType): Promise<
  Record<string, unknown>
> {
  const { usePublishPost } = await import('./use-publish-post');
  const mutation = usePublishPost() as unknown as {
    mutationFn: (variables: unknown) => Promise<unknown>;
  };

  const before = captured.length;
  await mutation.mutationFn({
    title: 'A post',
    body: 'Some body text',
    tags: ['photography'],
    rewardType,
  });
  expect(captured.length).toBe(before + 1);
  return captured[captured.length - 1];
}

/** The payload as this app sent it before a reward control existed. */
function withoutOptionsKey(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...payload };
  delete copy.options;
  return copy;
}

beforeEach(() => {
  captured.length = 0;
  authorRewards = 'author';
});

describe('the operation array an author actually signs', () => {
  it('extracts a builder that produces a real comment operation', () => {
    // Without this, every comparison below could be comparing two empty
    // arrays produced by an extraction that silently stopped working.
    const ops = buildOperations({
      author: 'alice',
      permlink: 'a-post',
      parentAuthor: '',
      parentPermlink: 'photography',
      title: 'A post',
      body: 'Some body text',
      jsonMetadata: { tags: ['photography'] },
    });
    expect(ops).toHaveLength(1);
    expect(ops[0][0]).toBe('comment');
    expect(ops[0][1].author).toBe('alice');
  });

  it('broadcasts one operation, byte for byte the old one, on the default selection', async () => {
    const payload = await publish('default');

    // The key exists, and its value is nothing. That is the whole mechanism:
    // `use-comment.ts` gates the second operation on `if (payload.options)`.
    expect('options' in payload).toBe(true);
    expect(payload.options).toBeUndefined();

    const withControl = buildOperations(payload);
    const asBefore = buildOperations(withoutOptionsKey(payload));

    expect(JSON.stringify(withControl)).toBe(JSON.stringify(asBefore));
    expect(withControl).toHaveLength(1);
    expect(withControl.map(([name]) => name)).toEqual(['comment']);
  });

  it('adds a fully written comment_options for a full power up', async () => {
    const payload = await publish('sp');
    const ops = buildOperations(payload);

    expect(ops.map(([name]) => name)).toEqual(['comment', 'comment_options']);
    expect(ops[1][1]).toEqual({
      author: 'alice',
      permlink: ops[0][1].permlink,
      max_accepted_payout: '1000000.000 HBD',
      percent_hbd: 0,
      allow_votes: true,
      allow_curation_rewards: true,
      extensions: [],
    });
    // The comment operation itself is untouched by the choice.
    expect(JSON.stringify(ops[0])).toBe(
      JSON.stringify(buildOperations(withoutOptionsKey(payload))[0]),
    );
  });

  it('adds a fully written comment_options for declined rewards', async () => {
    const payload = await publish('dp');
    const ops = buildOperations(payload);

    expect(ops.map(([name]) => name)).toEqual(['comment', 'comment_options']);
    expect(ops[1][1]).toEqual({
      author: 'alice',
      permlink: ops[0][1].permlink,
      max_accepted_payout: '0.000 HBD',
      percent_hbd: 10000,
      allow_votes: true,
      allow_curation_rewards: true,
      extensions: [],
    });
  });

  it('never carries a beneficiary extension', async () => {
    // Beneficiaries are a separate surface and are not offered here. The
    // extensions array is where one would appear, so it is asserted empty on
    // every selection that emits an operation at all.
    for (const selection of ['default', 'sp', 'dp'] as const) {
      const ops = buildOperations(await publish(selection));
      const options = ops.find(([name]) => name === 'comment_options');
      expect(options?.[1].extensions ?? [], selection).toEqual([]);
    }
  });

  it('emits nothing when the instance does not offer the control', async () => {
    // A draft can hold a selection from before the owner switched the panel
    // off. It must not reach the chain: the instance decides whether the
    // author is asked, and an author who was never asked publishes as before.
    authorRewards = 'off';

    for (const selection of ['sp', 'dp'] as const) {
      const payload = await publish(selection);
      expect(payload.options, selection).toBeUndefined();
      expect(buildOperations(payload), selection).toHaveLength(1);
    }
  });

  it('writes every field the SDK would otherwise default for us', async () => {
    // The reason the resolver spells all five out. These names are read off
    // the SDK's own destructuring pattern, so adding a sixth defaulted field
    // there fails here instead of shipping a value nobody chose.
    const fields = sdkOptionFields();
    expect(fields.length).toBeGreaterThanOrEqual(5);

    const payload = await publish('sp');
    expect(Object.keys(payload.options as object).sort()).toEqual(
      [...fields].sort(),
    );
  });

  it('demonstrates the default it is avoiding', async () => {
    // Same builder, same post, with one field left out: the SDK fills in a
    // payout cap of its own across the package boundary. Harmless here and
    // permanent on chain, which is why nothing in this app hands it a partial
    // options object.
    const payload = await publish('sp');
    const partial = { ...payload, options: { percentHbd: 0 } };
    const ops = buildOperations(partial);

    expect(ops[1][1].max_accepted_payout).toBe('1000000.000 HBD');
    expect(ops[1][1].allow_votes).toBe(true);
  });

  it('keeps the rest of the payload exactly as it was', async () => {
    // `options` is the only key this PR adds. Anything else appearing on the
    // way to a `comment` operation is a change to what gets signed.
    const payload = await publish('default');
    expect(Object.keys(payload).sort()).toEqual([
      'author',
      'body',
      'jsonMetadata',
      'options',
      'parentAuthor',
      'parentPermlink',
      'permlink',
      'title',
    ]);
  });
});
