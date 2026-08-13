import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The seed configs are producers, and retiring an option only touches
 * consumers.
 *
 * `config.template.json` is what a self-hoster copies, `default-config.json` is
 * what nginx serves for an unclaimed host, and `add-tenant.sh` writes a new
 * tenant's document. None of them is imported by the app, so nothing failed
 * when #1471 removed `listType` and `sidebar.placement` from the schema, the
 * editor and the CSS while all three kept emitting them. Every fresh
 * deployment carried settings the app ignores.
 *
 * This pins the direction that has no compiler behind it: a key the seeds write
 * must be a key something reads.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');

const RETIRED = ['listType', 'placement'];

const SEEDS = {
  'config.template.json': join(APP, 'config.template.json'),
  'hosting/default-config.json': join(APP, 'hosting', 'default-config.json'),
  'hosting/scripts/add-tenant.sh': join(
    APP,
    'hosting',
    'scripts',
    'add-tenant.sh',
  ),
};

describe('seed configs', () => {
  for (const [label, path] of Object.entries(SEEDS)) {
    it(`${label} writes no retired layout option`, () => {
      const source = readFileSync(path, 'utf8');
      for (const key of RETIRED) {
        expect(
          source.includes(`"${key}"`),
          `${label} still writes "${key}", which nothing reads since #1471`,
        ).toBe(false);
      }
    });
  }

  it('still seeds the layout options that ARE read', () => {
    // The counterweight: the check above is satisfied by deleting the whole
    // layout block, which would be a different bug. Search and the sidebar
    // sections are live options and both JSON seeds must keep declaring them.
    //
    // Presence, not value: the two seeds disagree on purpose. The template a
    // self-hoster copies shows the Hive info panel, the unclaimed-host document
    // hides it, and neither is wrong.
    for (const label of [
      'config.template.json',
      'hosting/default-config.json',
    ] as const) {
      const config = JSON.parse(readFileSync(SEEDS[label], 'utf8'));
      const layout = config.configuration.instanceConfiguration.layout;
      expect(layout.search?.enabled, `${label} search`).toBeTypeOf('boolean');
      for (const section of ['followers', 'following', 'hiveInformation']) {
        expect(
          layout.sidebar?.[section]?.enabled,
          `${label} sidebar.${section}`,
        ).toBeTypeOf('boolean');
      }
    }
  });
});
