import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ db: { query: vi.fn(), queryOne: vi.fn() } }));
vi.mock('../middleware/auth', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
  adminMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
}));

const { paymentRoutes } = await import('./payments');
const { MIN_INTERNAL_SECRET_LENGTH } = await import('./internal');

const STRONG = 'a'.repeat(MIN_INTERNAL_SECRET_LENGTH);
const original = process.env.HOSTING_INTERNAL_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.HOSTING_INTERNAL_SECRET;
  else process.env.HOSTING_INTERNAL_SECRET = original;
});

async function cardEnabled(): Promise<boolean> {
  const res = await paymentRoutes.request('http://localhost/methods');
  const body = (await res.json()) as { card: { enabled: boolean } };
  return body.card.enabled;
}

/**
 * The signup UI must not offer a rail whose fulfilment will be refused: the
 * customer would be charged and the activation would 403. Advertisement and
 * acceptance therefore have to be decided by the same predicate.
 */
describe('card rail availability', () => {
  it('is offered when the secret is strong enough to accept', async () => {
    process.env.HOSTING_INTERNAL_SECRET = STRONG;

    expect(await cardEnabled()).toBe(true);
  });

  it('is not offered when the secret is absent', async () => {
    delete process.env.HOSTING_INTERNAL_SECRET;

    expect(await cardEnabled()).toBe(false);
  });

  it('is not offered when the secret is present but too weak to accept', async () => {
    // The state this fix introduced: activation refuses it, so advertising the
    // option would take a payment that can never be fulfilled.
    process.env.HOSTING_INTERNAL_SECRET = 'short-secret';

    expect(await cardEnabled()).toBe(false);
  });
});
