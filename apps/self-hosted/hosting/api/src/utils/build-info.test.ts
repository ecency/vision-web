import { afterEach, describe, expect, it } from 'vitest';
import { buildHealthPayload, readApiVersion } from './build-info';

describe('build info', () => {
  afterEach(() => {
    delete process.env.GIT_SHA;
  });

  it('reads the real package version and answers it beside the baked sha', () => {
    process.env.GIT_SHA = 'abc1234';
    const version = readApiVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(buildHealthPayload(version)).toMatchObject({
      status: 'ok',
      version,
      sha: 'abc1234',
    });
  });

  it('degrades to unknown instead of failing the probe', () => {
    expect(readApiVersion(new URL('file:///nowhere/package.json'))).toBe('unknown');
    expect(buildHealthPayload('unknown').sha).toBe('unknown');
  });
});
