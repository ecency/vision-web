import { readFileSync } from 'node:fs';

/**
 * The build identity /health answers beside its status: the package version
 * and the CI-baked commit sha, so skew between the paired blog and API
 * images (built from one commit, tagged independently) is observable.
 *
 * package.json is read with fs, not a JSON import: this package is ESM and
 * Node's JSON modules need import attributes and carry no named exports, so
 * the import form that typechecks under bundler resolution crashes tsx at
 * boot.
 */
export function readApiVersion(
  url: URL = new URL('../../package.json', import.meta.url),
): string {
  try {
    return JSON.parse(readFileSync(url, 'utf8')).version as string;
  } catch {
    return 'unknown';
  }
}

export function buildHealthPayload(version: string): {
  status: 'ok';
  timestamp: string;
  version: string;
  sha: string;
} {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version,
    sha: process.env.GIT_SHA || 'unknown',
  };
}
