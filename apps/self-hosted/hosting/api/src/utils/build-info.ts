/**
 * The build identity /health answers beside its status. The version is the
 * CANONICAL release version baked by a self-hosted-vX.Y.Z tag build — the
 * tag is the single product-version source, so a sha-only build answers
 * 'untagged' rather than some package.json number nothing enforces. The sha
 * is baked by every CI build, so skew between the paired blog and API
 * images (built from one commit, tagged independently) is observable.
 */
export function buildHealthPayload(): {
  status: 'ok';
  timestamp: string;
  version: string;
  sha: string;
} {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.RELEASE_VERSION || 'untagged',
    sha: process.env.GIT_SHA || 'unknown',
  };
}
