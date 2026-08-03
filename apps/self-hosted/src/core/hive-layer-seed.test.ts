import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  HIVE_LAYER_CONFIG_DEFAULTS,
  HIVE_LAYER_SEED,
  resolveHiveLayer,
} from './hive-layer';

/**
 * The seed a new tenant is created with cannot drift from the resolver that
 * reads it back.
 *
 * The value is written in `hosting/api`, which builds with `rootDir: ./src` and
 * a Docker context of its own directory, so it cannot import this module and
 * this module cannot import it. The seed is therefore read off that file's
 * syntax tree. Two independently maintained copies of the same two strings is
 * how a seeded value ends up meaning something the read site does not
 * recognise, at which point every new instance silently falls back to `off` and
 * nobody finds out until an owner asks where their earnings went.
 */

const TENANT_SERVICE = join(
  __dirname,
  '..',
  '..',
  'hosting',
  'api',
  'src',
  'services',
  'tenant-service.ts',
);

/** The `hive: { ... }` object literal seeded inside `features`, as data. */
function seededHiveBlock(): Record<string, unknown> | null {
  const sf = ts.createSourceFile(
    TENANT_SERVICE,
    readFileSync(TENANT_SERVICE, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  let found: Record<string, unknown> | null = null;

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      !ts.isComputedPropertyName(node.name) &&
      node.name.getText(sf) === 'hive' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const block: Record<string, unknown> = {};
      for (const property of node.initializer.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          !ts.isComputedPropertyName(property.name) &&
          ts.isStringLiteralLike(property.initializer)
        ) {
          block[property.name.getText(sf)] = property.initializer.text;
        } else {
          // A non-string leaf would be a `number` or an object, both of which
          // this design bars. Reported by failing the shape, not skipped.
          block[property.name?.getText(sf) ?? '<computed>'] =
            property.getText(sf);
        }
      }
      found = block;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return found;
}

describe('the hosting seed and the client resolver agree', () => {
  const seeded = seededHiveBlock();

  it('finds the seeded block in the hosting API', () => {
    expect(seeded).not.toBeNull();
  });

  it('seeds exactly what the resolver declares as the seed', () => {
    expect(seeded).toEqual({ ...HIVE_LAYER_SEED });
  });

  it('seeds only keys the resolver has an absence value for', () => {
    for (const key of Object.keys(seeded ?? {})) {
      expect(Object.keys(HIVE_LAYER_CONFIG_DEFAULTS)).toContain(key);
    }
  });

  it('resolves the seeded document to the standard posture', () => {
    const layer = resolveHiveLayer({
      features: { hive: seeded },
      composerIsInternal: true,
    });
    expect(layer.readerLayer).toBe('standard');
    expect(layer.authorRewards).toBe('author');
    expect(layer.showPayoutOnPost).toBe(true);
    expect(layer.showChainPermalink).toBe(true);
    // Not the full posture: no payout on feed cards.
    expect(layer.showPayoutInFeed).toBe(false);
  });
});
