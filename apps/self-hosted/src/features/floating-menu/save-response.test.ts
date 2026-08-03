import { describe, expect, it } from 'vitest';
import {
  readDiscarded,
  readSavedConfig,
  withServedOnlyMarkers,
} from './save-response';

const savedConfig = {
  version: 1,
  configuration: {
    instanceConfiguration: { type: 'blog', username: 'alice' },
  },
} as never;

/**
 * ConfigService injects `managed` when it serves the file and TenantService
 * deletes it before storing, so the save response never carries it. On a custom
 * domain that flag is the only signal the app has, so adopting the response
 * verbatim made the next save refuse with "This site is not on managed hosting".
 */
describe('adopting the saved config', () => {
  it('keeps the managed marker the server strips before storing', () => {
    const adopted = withServedOnlyMarkers(savedConfig, true);

    expect(
      (adopted.configuration as never as Record<string, Record<string, unknown>>)
        .instanceConfiguration.managed,
    ).toBe(true);
  });

  it('does not invent the marker for a true self-hosted instance', () => {
    const adopted = withServedOnlyMarkers(savedConfig, undefined);

    expect(
      (adopted.configuration as never as Record<string, Record<string, unknown>>)
        .instanceConfiguration.managed,
    ).toBeUndefined();
  });

  it('leaves a response with no configuration alone', () => {
    expect(withServedOnlyMarkers({ version: 1 } as never, true)).toEqual({
      version: 1,
    });
  });

  it('reads the stored config back, and nothing else', () => {
    expect(readSavedConfig({ config: savedConfig })).toBe(savedConfig);
    expect(readSavedConfig({ config: { version: 1 } })).toBe(null);
    expect(readSavedConfig({ config: [] })).toBe(null);
    expect(readSavedConfig(null)).toBe(null);
  });
});

/**
 * A save can succeed while parts of it are dropped, because the server pins
 * identity fields and refuses filters the pinned type cannot serve. The editor
 * reported "Saved!" and kept displaying the rejected value.
 */
describe('discarded fields', () => {
  it('lists what the server refused to store', () => {
    const paths = readDiscarded({
      discarded: [
        { path: 'instanceConfiguration.type', reason: 'pinned' },
        { path: 'instanceConfiguration.postsFilters', reason: 'invalid sort' },
      ],
    });

    expect(paths).toEqual([
      'instanceConfiguration.type',
      'instanceConfiguration.postsFilters',
    ]);
  });

  it('is empty for a save that stored everything', () => {
    expect(readDiscarded({ config: savedConfig })).toEqual([]);
  });

  it('ignores a malformed discarded field rather than throwing mid-save', () => {
    expect(readDiscarded({ discarded: 'nope' })).toEqual([]);
    expect(readDiscarded({ discarded: [null, 42, { reason: 'no path' }] })).toEqual(
      [],
    );
  });
});
