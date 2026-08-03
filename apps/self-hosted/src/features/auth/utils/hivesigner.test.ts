// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  consumeHivesignerState,
  createHivesignerState,
  resolveHivesignerClientId,
  getHivesignerLoginUrl,
  verifyHivesignerToken,
} = await import('./hivesigner');

beforeEach(() => {
  sessionStorage.clear();
});

/**
 * OAuth matches redirect_uri exactly, and ecency.app registers only ecency.com
 * origins, so the built-in client can never complete a login on a hosted blog.
 * Offering the button anyway sends the visitor to an error page.
 */
describe('hivesigner availability', () => {
  it('reports unavailable when the instance has no client of its own', () => {
    expect(resolveHivesignerClientId(undefined)).toBe(null);
  });

  it('reports available once the owner names their registered app', () => {
    expect(resolveHivesignerClientId('myblog.app')).toBe('myblog.app');
  });

  it('ignores a blank or non-string client id', () => {
    expect(resolveHivesignerClientId('   ')).toBe(null);
    expect(resolveHivesignerClientId(42)).toBe(null);
    expect(resolveHivesignerClientId(null)).toBe(null);
  });
});

describe('login url', () => {
  it('carries the configured client and the state nonce', () => {
    const url = new URL(
      getHivesignerLoginUrl(
        'https://myblog.com/auth',
        'nonce123',
        'myblog.app',
      ),
    );

    expect(url.searchParams.get('client_id')).toBe('myblog.app');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://myblog.com/auth',
    );
    expect(url.searchParams.get('state')).toBe('nonce123');
  });
});

/**
 * Without the nonce, any page load carrying ?access_token=&username= was a
 * completed login, so a crafted link signed the visitor in as someone else.
 */
describe('state nonce', () => {
  it('accepts only the value this tab issued, and only once', () => {
    const issued = createHivesignerState();

    expect(consumeHivesignerState(issued)).toBe(true);
    // Consumed, so a replay of the same callback fails.
    expect(consumeHivesignerState(issued)).toBe(false);
  });

  it('rejects a mismatched or absent state', () => {
    createHivesignerState();
    expect(consumeHivesignerState('someone-elses-nonce')).toBe(false);

    createHivesignerState();
    expect(consumeHivesignerState(null)).toBe(false);
  });

  it('rejects any state when this tab never started a login', () => {
    expect(consumeHivesignerState('anything')).toBe(false);
  });
});

describe('token verification', () => {
  const fetchMock = (body: unknown, ok = true) =>
    vi.fn(async () => ({
      ok,
      json: async () => body,
    })) as unknown as typeof fetch;

  it('accepts a token whose account matches the claimed username', async () => {
    globalThis.fetch = fetchMock({ account: { name: 'alice' } });
    expect(await verifyHivesignerToken('tok', 'alice')).toBe(true);
  });

  it('rejects a token belonging to a different account', async () => {
    // The attack: a valid token for someone else, handed over in a link.
    globalThis.fetch = fetchMock({ account: { name: 'attacker' } });
    expect(await verifyHivesignerToken('tok', 'alice')).toBe(false);
  });

  it('rejects when the token is not accepted at all', async () => {
    globalThis.fetch = fetchMock({}, false);
    expect(await verifyHivesignerToken('tok', 'alice')).toBe(false);
  });

  it('fails closed when the check cannot be made', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await verifyHivesignerToken('tok', 'alice')).toBe(false);
  });
});
