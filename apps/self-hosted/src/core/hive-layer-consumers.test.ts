import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { resolveHiveLayer } from './hive-layer';

/**
 * Every posture the resolver offers has to be a posture the app renders.
 *
 * The finding this exists for: three postures were advertised and two shipped.
 * `showPayoutInFeed`, a vote-weight flag and a downvote flag were all resolved
 * from `readerLayer: full`, and not one of them was read by a component, so
 * `full` behaved exactly like `standard` on a live site. A resolver test cannot
 * catch that on its own, because the resolver was doing precisely what it said.
 *
 * So the check is on the other end: for every boolean the resolver returns,
 * name the file and the component that renders it, and assert that file really
 * reads the flag and really renders that component. Nothing in
 * `apps/self-hosted` is DOM-testable (`environment: 'node'`,
 * `include: ['src/**\/*.test.ts']`), so a source scan is the strongest
 * statement about rendering available here, and it is the same mechanism
 * `src/routes/-internal-links.test.ts` already uses.
 */

const SRC = join(__dirname, '..');

/**
 * Where each render flag is consumed. Adding a flag means adding a row, which
 * means having somewhere to point it at.
 */
const FLAG_CONSUMERS: Record<string, { file: string; component: string }> = {
  showPayoutOnPost: {
    file: 'features/blog/components/blog-post-footer.tsx',
    component: 'PostPayout',
  },
  showPayoutInFeed: {
    file: 'features/blog/components/blog-post-item.tsx',
    component: 'PostPayout',
  },
  showChainNote: {
    file: 'features/blog/components/blog-post-footer.tsx',
    component: 'HivePostNote',
  },
  showChainPermalink: {
    file: 'features/blog/components/blog-post-footer.tsx',
    component: 'HivePostNote',
  },
};

/**
 * Non-boolean resolver output that has no consumer yet.
 *
 * Deliberate, like a DYNAMIC_LINKS entry: an entry here is an admission, so it
 * carries the reason and the thing that removes it. An empty list is the goal.
 */
const AWAITING_CONSUMER: Record<string, string> = {
  authorRewards:
    'composer reward controls, the second half of this track. Kept resolved because the hosting seed already writes the field and its external-composer clamp reads createPostUrl, which every existing tenant carries',
};

/** Which postures differ, computed from the resolver rather than restated. */
function flagsFor(readerLayer: string): Record<string, boolean> {
  const resolved = resolveHiveLayer({
    features: { hive: { readerLayer } },
    composerIsInternal: true,
  });
  return Object.fromEntries(
    Object.entries(resolved).filter(([, value]) => typeof value === 'boolean'),
  ) as Record<string, boolean>;
}

function parse(relative: string): ts.SourceFile {
  const path = join(SRC, relative);
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

/** Every `x.<name>` property read in the file. */
function propertyReads(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node)) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** Every JSX tag rendered in the file. */
function renderedTags(sf: ts.SourceFile): Set<string> {
  const tags = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      tags.add(node.tagName.getText(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return tags;
}

describe('no posture is advertised without something that renders it', () => {
  const resolvedKeys = Object.keys(
    resolveHiveLayer({ features: {}, composerIsInternal: true }),
  );

  it('has a named consumer for every render flag the resolver returns', () => {
    const flags = Object.keys(flagsFor('full'));
    expect(flags.sort()).toEqual(Object.keys(FLAG_CONSUMERS).sort());
  });

  it('leaves no non-boolean output unaccounted for', () => {
    // readerLayer is the posture itself; payoutLabel and learnMoreUrl are read
    // by the two components above. Anything else has to be listed with a reason.
    const named = new Set([
      'readerLayer',
      'payoutLabel',
      'learnMoreUrl',
      ...Object.keys(FLAG_CONSUMERS),
      ...Object.keys(AWAITING_CONSUMER),
    ]);
    expect(resolvedKeys.filter((key) => !named.has(key))).toEqual([]);
  });

  it('states a reason for anything still awaiting a consumer', () => {
    for (const [key, reason] of Object.entries(AWAITING_CONSUMER)) {
      expect(resolvedKeys, `${key} is no longer resolved at all`).toContain(
        key,
      );
      expect(reason.length).toBeGreaterThan(30);
    }
  });

  it.each(Object.entries(FLAG_CONSUMERS))(
    '%s is read where it is declared to be',
    (flag, { file, component }) => {
      const sf = parse(file);
      expect(propertyReads(sf), `${file} never reads ${flag}`).toContain(flag);
      expect(renderedTags(sf), `${file} never renders ${component}`).toContain(
        component,
      );
    },
  );

  it('renders the difference between standard and full on a real surface', () => {
    const standard = flagsFor('standard');
    const full = flagsFor('full');
    const added = Object.keys(full).filter(
      (flag) => full[flag] && !standard[flag],
    );

    // full must add something...
    expect(added.length).toBeGreaterThan(0);

    // ...on a file that standard does not already light up, or the two
    // postures are the same page with a different config value.
    const standardFiles = new Set(
      Object.keys(standard)
        .filter((flag) => standard[flag])
        .map((flag) => FLAG_CONSUMERS[flag].file),
    );
    const addedFiles = added.map((flag) => FLAG_CONSUMERS[flag].file);

    expect(addedFiles.some((file) => !standardFiles.has(file))).toBe(true);
  });
});
