import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Source guards for the one rule this app kept breaking: never state something
 * a request has not established.
 *
 * Three shapes of it shipped at once. A failed page fetch discarded the pages
 * already on screen. A failed comments fetch rendered "No comments yet" on a
 * post with a discussion, and a failed community fetch rendered "Community not
 * found." to the owner of a running one. And an uncaught render error printed a
 * raw JavaScript exception where the whole site had been.
 *
 * None of it is reachable from a unit test: vitest here runs `environment:
 * 'node'` over `src/**\/*.test.ts`, so `.tsx` cannot be rendered at all. The
 * decision itself lives in `query-outcome.ts` and is tested directly next door.
 * What is left is whether the components actually route through it, which is a
 * property of the source, so it is checked in the source. Same approach as
 * `routes/-internal-links.test.ts`.
 */

const APP = join(__dirname, '..', '..', '..');
const SRC = join(APP, 'src');

/** The one sanctioned test that licenses saying "there is nothing here". */
const GUARD = 'nothingToShow';

/** Strings a reader reads as a statement that the content does not exist. */
const EMPTINESS_CLAIMS = new Set([
  'noPosts',
  'postNotFound',
  'community_not_found',
  'comments_empty',
  'no_results',
]);

/**
 * Every emptiness claim, and how many times it may appear, guarded by GUARD.
 *
 * Pinned rather than counted, so deleting a guard fails here as loudly as
 * adding an unguarded claim, and so a second claim in the same file has to be
 * looked at rather than inheriting the first one's cover.
 */
const GUARDED_CLAIMS: Record<string, number> = {
  'src/features/blog/components/blog-posts-list.tsx:noPosts': 1,
  'src/features/blog/components/blog-post-page.tsx:postNotFound': 1,
  'src/features/blog/components/blog-post-discussion.tsx:comments_empty': 1,
  'src/features/blog/layout/blog-sidebar.tsx:community_not_found': 1,
  'src/routes/edit.$author.$permlink.tsx:postNotFound': 1,
};

/**
 * Claims that are not routed through GUARD. Adding an entry is a deliberate
 * act: say why it is safe, and say what would close it.
 */
const UNGUARDED_CLAIMS: Record<
  string,
  { occurrences: number; reason: string }
> = {
  'src/features/blog/components/search-results.tsx:no_results': {
    occurrences: 1,
    reason:
      'search already returns its error branch above this one, so a failed search is not reported as no results. What is left is a fetch paused because the browser is offline, which reports no data, no error and no loading. Closing that belongs with the rest of the search empty state, which also has to echo the query back and offer a retry.',
  },
};

/**
 * The surfaces that render fetched content. Each must decide through the shared
 * outcome, and none may return a failure UI out of a raw query flag, which is
 * the exact shape that threw away content already on screen.
 */
const READING_SURFACES = [
  'src/features/blog/components/blog-posts-list.tsx',
  'src/features/blog/components/blog-post-page.tsx',
  'src/features/blog/components/blog-post-discussion.tsx',
  'src/features/blog/layout/blog-sidebar.tsx',
  'src/routes/edit.$author.$permlink.tsx',
];

/** Raw query flags. A return gated on one of these is the regression. */
const RAW_FAILURE_FLAGS = new Set(['isError', 'error', 'isLoading']);

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...tsxFiles(full));
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

const rel = (file: string) => `src/${relative(SRC, file).split(sep).join('/')}`;

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function each(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => each(child, visit));
}

/** Does this expression call `name(...)` anywhere inside it? */
function callsFunction(expr: ts.Node, name: string): boolean {
  let found = false;
  each(expr, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === name
    ) {
      found = true;
    }
  });
  return found;
}

/** Does this node call `receiver.name(...)` anywhere inside it? */
function callsMethod(node: ts.Node, name: string): boolean {
  let found = false;
  each(node, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === name
    ) {
      found = true;
    }
  });
  return found;
}

/** Does this expression compare against this string literal anywhere inside it? */
function mentionsLiteral(node: ts.Node, value: string): boolean {
  let found = false;
  each(node, (n) => {
    if (ts.isStringLiteralLike(n) && n.text === value) {
      found = true;
    }
  });
  return found;
}

/** Does this expression read one of these bare identifiers? */
function readsIdentifier(expr: ts.Node, names: Set<string>): boolean {
  let found = false;
  each(expr, (n) => {
    if (!ts.isIdentifier(n) || !names.has(n.text)) return;
    // `entry.error` is a property of something else, not the query flag.
    if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) return;
    found = true;
  });
  return found;
}

/**
 * The conditions every path reaching `node` has to have passed.
 *
 * Only the three shapes that actually appear as a branch on the way to a piece
 * of JSX are read: the then-branch of an `if`, the true arm of a ternary, and
 * the right side of `&&`. Anything else leaves the node ungoverned and it has
 * to be classified, which is the safe direction to be wrong in.
 */
function dominators(node: ts.Node): ts.Node[] {
  const tests: ts.Node[] = [];
  let child: ts.Node = node;
  let parent: ts.Node | undefined = node.parent;

  while (parent) {
    if (ts.isIfStatement(parent) && child === parent.thenStatement) {
      tests.push(parent.expression);
    } else if (
      ts.isConditionalExpression(parent) &&
      child === parent.whenTrue
    ) {
      tests.push(parent.condition);
    } else if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      child === parent.right
    ) {
      tests.push(parent.left);
    }
    child = parent;
    parent = parent.parent;
  }
  return tests;
}

function isGuarded(node: ts.Node, guard: string): boolean {
  return dominators(node).some((test) => callsFunction(test, guard));
}

interface Claim {
  key: string;
  guarded: boolean;
}

function sweepClaims(): Claim[] {
  const claims: Claim[] = [];
  for (const file of tsxFiles(SRC)) {
    const sf = parse(file);
    each(sf, (n) => {
      if (
        !ts.isCallExpression(n) ||
        !ts.isIdentifier(n.expression) ||
        n.expression.text !== 't' ||
        n.arguments.length !== 1
      ) {
        return;
      }
      const [arg] = n.arguments;
      if (!ts.isStringLiteralLike(arg)) return;
      if (!EMPTINESS_CLAIMS.has(arg.text)) return;
      claims.push({
        key: `${rel(file)}:${arg.text}`,
        guarded: isGuarded(n, GUARD),
      });
    });
  }
  return claims;
}

function tally(keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) out[key] = (out[key] ?? 0) + 1;
  return out;
}

describe('emptiness is only ever claimed off something established', () => {
  const claims = sweepClaims();

  it('finds the claims it is meant to be checking', () => {
    // A rename that made this sweep match nothing would otherwise pass silently.
    expect(claims.length).toBeGreaterThanOrEqual(
      Object.keys(GUARDED_CLAIMS).length,
    );
  });

  it('routes every guarded claim through the shared outcome', () => {
    const guarded = tally(claims.filter((c) => c.guarded).map((c) => c.key));
    expect(guarded).toEqual(GUARDED_CLAIMS);
  });

  it('classifies every claim that is not', () => {
    const unguarded = tally(claims.filter((c) => !c.guarded).map((c) => c.key));
    const declared = Object.fromEntries(
      Object.entries(UNGUARDED_CLAIMS).map(([k, v]) => [k, v.occurrences]),
    );
    expect(unguarded).toEqual(declared);
  });

  it('reads the guard as a call, not as any mention of the name', () => {
    // The classifier itself, exercised on both answers.
    const probe = (code: string) => {
      const sf = ts.createSourceFile(
        'probe.tsx',
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      let target: ts.Node | undefined;
      each(sf, (n) => {
        if (
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === 't'
        ) {
          target = n;
        }
      });
      return target ? isGuarded(target, GUARD) : undefined;
    };

    expect(
      probe('const A = () => (nothingToShow(o) ? t("noPosts") : null);'),
    ).toBe(true);
    expect(
      probe('const A = () => nothingToShow(o) && <p>{t("noPosts")}</p>;'),
    ).toBe(true);
    expect(
      probe('function A() { if (nothingToShow(o)) { return t("noPosts"); } }'),
    ).toBe(true);
    // the shapes that must not count
    expect(probe('const A = () => t("noPosts");')).toBe(false);
    expect(
      probe('const A = () => (o === "empty" ? t("noPosts") : null);'),
    ).toBe(false);
    expect(
      probe(
        'function A() { if (nothingToShow(o)) { return null; } return t("noPosts"); }',
      ),
    ).toBe(false);
    expect(probe('const A = () => nothingToShow(o) || t("noPosts");')).toBe(
      false,
    );
  });
});

describe('a failure does not take content off the screen', () => {
  for (const surface of READING_SURFACES) {
    const sf = parse(join(APP, surface));

    it(`${surface} decides through the shared outcome`, () => {
      expect(callsFunction(sf, 'resolveQueryOutcome')).toBe(true);
    });

    it(`${surface} returns nothing off a raw query flag`, () => {
      // `if (isError) return <ErrorMessage />` above the content is the whole
      // defect: query-core keeps `data` through an error, so that return
      // discarded pages the reader already had, and their place in them.
      const offenders: string[] = [];
      each(sf, (n) => {
        if (!ts.isIfStatement(n)) return;
        if (!readsIdentifier(n.expression, RAW_FAILURE_FLAGS)) return;
        let returns = false;
        each(n.thenStatement, (inner) => {
          if (ts.isReturnStatement(inner)) returns = true;
        });
        if (returns) {
          const line =
            sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          offenders.push(`${surface}:${line}`);
        }
      });
      expect(offenders).toEqual([]);
    });
  }
});

describe('a surface that keeps content says the refresh failed', () => {
  // Computing a stale outcome and then rendering as though nothing happened is
  // worse than not computing it: to anyone reading the file it looks handled,
  // and to the reader the content silently stops being current.
  for (const surface of READING_SURFACES) {
    const sf = parse(join(APP, surface));

    it(`${surface} renders a failure notice under the stale outcome`, () => {
      const announced: boolean[] = [];
      each(sf, (n) => {
        if (!ts.isJsxSelfClosingElement(n) && !ts.isJsxOpeningElement(n))
          return;
        if (n.tagName.getText(sf) !== 'InlineError') return;
        announced.push(
          dominators(n).some((test) => mentionsLiteral(test, 'stale')),
        );
      });
      expect(announced).toContain(true);
    });
  }
});

describe('the editor waits for a read that succeeded', () => {
  const file = 'src/routes/edit.$author.$permlink.tsx';
  const sf = parse(join(APP, file));

  it('does not open on the presence of a cached entry alone', () => {
    // Every reading surface treats "there is an entry" as enough. This one
    // cannot: the editor seeds title, body, tags and metadata from that entry
    // and the update broadcast carries no version check, so an entry that was
    // not read during this mount lets a save overwrite the author's newer post.
    const gates: boolean[] = [];
    each(sf, (n) => {
      if (!ts.isJsxSelfClosingElement(n) && !ts.isJsxOpeningElement(n)) return;
      if (n.tagName.getText(sf) !== 'EditPageContent') return;
      gates.push(
        dominators(n).some((test) =>
          readsIdentifier(test, new Set(['readConfirmed'])),
        ),
      );
    });
    expect(gates).toEqual([true]);
    expect(callsFunction(sf, 'isReadConfirmed')).toBe(true);
  });

  /**
   * This defect survived a first fix because the gate looked right. It asked
   * whether the query had succeeded, and query-core reports success the instant
   * the cache holds an entry, with no request behind it. So the property worth
   * pinning is not "the editor is gated" but what the gate is allowed to count
   * as evidence: something that can only be true after a request belonging to
   * this mount has come back.
   */
  it('requires evidence from after this mount, not the presence of data', () => {
    // Read off the argument rather than the file: the destructured name stays
    // present in the source even if what is handed to the gate is a constant,
    // and a hardcoded `fetchedAfterMount: true` is the same defect again.
    const evidence: string[] = [];
    each(sf, (n) => {
      if (
        !ts.isCallExpression(n) ||
        !ts.isIdentifier(n.expression) ||
        n.expression.text !== 'isReadConfirmed'
      ) {
        return;
      }
      for (const arg of n.arguments) {
        if (!ts.isObjectLiteralExpression(arg)) continue;
        for (const prop of arg.properties) {
          if (
            !ts.isPropertyAssignment(prop) ||
            !ts.isIdentifier(prop.name) ||
            prop.name.text !== 'fetchedAfterMount'
          ) {
            continue;
          }
          evidence.push(prop.initializer.getText(sf));
        }
      }
    });
    expect(evidence).toEqual(['isFetchedAfterMount']);
  });

  it('issues that request even when the cache is fresh', () => {
    // Without this the global one minute staleTime suppresses the fetch
    // entirely, isFetchedAfterMount never becomes true, and the gate above
    // turns from a safety check into a door that never opens.
    const overrides: string[] = [];
    each(sf, (n) => {
      if (
        !ts.isPropertyAssignment(n) ||
        !ts.isIdentifier(n.name) ||
        n.name.text !== 'refetchOnMount'
      ) {
        return;
      }
      overrides.push(
        ts.isStringLiteralLike(n.initializer)
          ? n.initializer.text
          : '<dynamic>',
      );
    });
    expect(overrides).toEqual(['always']);
  });
});

describe('keeping content is paired with a cache that was filtered', () => {
  const file = 'src/core/dmca.ts';
  const sf = ts.createSourceFile(
    file,
    readFileSync(join(APP, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  it('throws away post data that predates the lists', () => {
    // The pairing this whole file exists to protect. The reading surfaces keep
    // what they have when a request fails; that is only safe while everything
    // cached was filtered under the lists currently in force. A post cached
    // before the lists installed was filtered against nothing, so invalidating
    // it, which only schedules a refetch, leaves takedown-listed content on
    // screen for the rest of the session when that refetch fails.
    expect(callsMethod(sf, 'resetQueries')).toBe(true);
    expect(callsMethod(sf, 'invalidateQueries')).toBe(false);
  });
});

describe('a failed page does not turn into a retry storm', () => {
  const file = 'src/features/blog/components/blog-posts-list.tsx';
  const sf = parse(join(APP, file));

  it('takes the bottom sentinel down while the feed is failing', () => {
    // The reader is sitting at the bottom of the feed, which is where the
    // fetch failed. Leaving the intersection sentinel mounted refires the same
    // request the instant the retries stop, forever. Keeping the loaded posts
    // on screen is only an improvement if that does not happen, so the retry
    // has to be the reader's, through the strip.
    const sentinels: boolean[] = [];
    each(sf, (n) => {
      if (!ts.isJsxSelfClosingElement(n) && !ts.isJsxOpeningElement(n)) return;
      if (n.tagName.getText(sf) !== 'DetectBottom') return;
      sentinels.push(
        dominators(n).some((test) =>
          readsIdentifier(test, new Set(['outcome'])),
        ),
      );
    });
    expect(sentinels).toEqual([true]);
  });

  it('retries the operation that failed, not the one that is available', () => {
    // Choosing off hasNextPage gets the common case wrong: a failed refresh of
    // the loaded pages while more pages exist would append a page, clearing
    // the error while leaving every page the reader can see just as stale.
    const retries: boolean[] = [];
    each(sf, (n) => {
      if (!ts.isJsxSelfClosingElement(n) && !ts.isJsxOpeningElement(n)) return;
      if (n.tagName.getText(sf) !== 'InlineError') return;
      for (const attr of n.attributes.properties) {
        if (
          !ts.isJsxAttribute(attr) ||
          !ts.isIdentifier(attr.name) ||
          attr.name.text !== 'onRetry' ||
          !attr.initializer
        ) {
          continue;
        }
        retries.push(callsFunction(attr.initializer, 'chooseFeedRetry'));
      }
    });
    expect(retries).toEqual([true]);
  });
});

describe('what counts as content is measured on the right thing', () => {
  const file = 'src/features/blog/components/blog-post-discussion.tsx';
  const sf = parse(join(APP, file));

  it('measures the discussion by its replies, not by the response', () => {
    // bridge.get_discussion returns the whole thread including the root post,
    // so the response is never empty on a success. Measured on it, every post
    // resolves to 'content' and the app can neither say "no comments yet" when
    // that is true nor report a failure when it is not.
    const offenders: string[] = [];
    each(sf, (n) => {
      if (
        !ts.isCallExpression(n) ||
        !ts.isIdentifier(n.expression) ||
        n.expression.text !== 'resolveQueryOutcome'
      ) {
        return;
      }
      for (const arg of n.arguments) {
        if (!ts.isObjectLiteralExpression(arg)) continue;
        for (const prop of arg.properties) {
          if (
            !ts.isPropertyAssignment(prop) ||
            !ts.isIdentifier(prop.name) ||
            prop.name.text !== 'hasContent'
          ) {
            continue;
          }
          if (readsIdentifier(prop.initializer, new Set(['allComments']))) {
            offenders.push(prop.getText(sf));
          }
        }
      }
    });
    expect(offenders).toEqual([]);
    expect(callsFunction(sf, 'selectTopLevelComments')).toBe(true);
  });
});

describe('the root error boundary is dressed and reports', () => {
  const root = parse(join(APP, 'src/routes/__root.tsx'));

  it('passes a themed fallback and an error handler', () => {
    const props: string[] = [];
    each(root, (n) => {
      if (!ts.isJsxOpeningLikeElement(n)) return;
      if (n.tagName.getText(root) !== 'ErrorBoundary') return;
      for (const attr of n.attributes.properties) {
        if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name)) {
          props.push(attr.name.text);
        }
      }
    });
    // Without these the boundary falls back to printing `error.message` raw,
    // with a hardcoded English retry that re-renders the tree that just threw.
    expect(props).toContain('fallback');
    expect(props).toContain('onError');
  });

  const crash = parse(join(APP, 'src/features/shared/crash-screen.tsx'));

  it('offers a reload rather than re-rendering the tree that threw', () => {
    let reloads = false;
    each(crash, (n) => {
      if (ts.isPropertyAccessExpression(n) && n.name.text === 'reload') {
        reloads = true;
      }
    });
    expect(reloads).toBe(true);
  });

  it('takes every word it shows from the locale system', () => {
    const literals: string[] = [];
    each(crash, (n) => {
      if (ts.isJsxText(n) && n.text.trim().length > 0) {
        literals.push(n.text.trim());
      }
    });
    expect(literals).toEqual([]);
    expect(callsFunction(crash, 't')).toBe(true);
  });
});
