import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Feed links go through the router, so the router's encoding decides the URL
 * every reader, crawler and shared link carries.
 *
 * The router percent-encodes path params, so passing the canonical '@author'
 * yields /%40author/permlink. Dropping the '@' avoids that but makes every feed
 * link non-canonical, and '@author/permlink' is the form the rest of the Hive
 * ecosystem links with. Allowing '@' through unencoded is what keeps both.
 *
 * The two halves only work together: allowing the character without passing it
 * changes nothing, and passing it without allowing it produces %40. This checks
 * the pair, since neither is expressible in the type system.
 *
 * Lives under src/routes with a '-' prefix, TanStack Router's convention for a
 * non-route file in the routes directory.
 */

const APP = join(__dirname, '..', '..');

function read(relative: string): string {
  return readFileSync(join(APP, relative), 'utf8');
}

describe('canonical post links', () => {
  it("configures the router to leave '@' unencoded", () => {
    expect(read('src/index.tsx')).toMatch(
      /pathParamsAllowedCharacters:\s*\['@'\]/,
    );
  });

  it("builds feed post links with the '@' prefix", () => {
    const source = read('src/features/blog/components/blog-post-item.tsx');

    expect(source).toMatch(/author:\s*`@\$\{[^}]+\}`/);
  });
});
