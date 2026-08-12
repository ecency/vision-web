import { afterEach, describe, expect, it } from 'vitest';
import { buildHealthPayload } from './build-info';

describe('build info', () => {
  afterEach(() => {
    delete process.env.GIT_SHA;
    delete process.env.RELEASE_VERSION;
  });

  it('answers the baked release version and sha', () => {
    process.env.RELEASE_VERSION = 'v1.0.1';
    process.env.GIT_SHA = 'abc1234';
    expect(buildHealthPayload()).toMatchObject({
      status: 'ok',
      version: 'v1.0.1',
      sha: 'abc1234',
    });
  });

  it('a sha-only build says untagged, never a number nothing enforces', () => {
    process.env.GIT_SHA = 'abc1234';
    expect(buildHealthPayload()).toMatchObject({
      version: 'untagged',
      sha: 'abc1234',
    });
    delete process.env.GIT_SHA;
    expect(buildHealthPayload().sha).toBe('unknown');
  });
});
