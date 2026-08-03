import { describe, expect, it } from 'vitest';
import {
  type ConfirmationPolicy,
  confirmationBudgetMs,
  MEMBERSHIP_CONFIRMATION,
  nextConfirmationStep,
} from './membership-confirmation';

/** Two reads, one second apart, so the bound is easy to walk to the end of. */
const SHORT: ConfirmationPolicy = { attempts: 2, intervalMs: 1000 };

describe('nextConfirmationStep', () => {
  it('confirms only when the community reports what was asked for', () => {
    expect(nextConfirmationStep(true, true, 1, SHORT)).toEqual({
      kind: 'confirmed',
    });
    expect(nextConfirmationStep(false, false, 1, SHORT)).toEqual({
      kind: 'confirmed',
    });
  });

  it('retries while there is budget left', () => {
    // The case this exists for: the broadcast resolved on mempool acceptance,
    // so the very first read back normally still says "not subscribed".
    expect(nextConfirmationStep(false, true, 1, SHORT)).toEqual({
      kind: 'retry',
      delayMs: 1000,
    });
  });

  it('gives up at the bound rather than waiting forever', () => {
    expect(nextConfirmationStep(false, true, 2, SHORT)).toEqual({
      kind: 'unconfirmed',
    });
    expect(nextConfirmationStep(false, true, 99, SHORT)).toEqual({
      kind: 'unconfirmed',
    });
  });

  it('never reports success from an absent reading', () => {
    // A failed read is not agreement. Treating undefined as "matches" is how a
    // network blip would confirm a membership that never happened.
    expect(nextConfirmationStep(undefined, true, 1, SHORT)).toEqual({
      kind: 'retry',
      delayMs: 1000,
    });
    expect(nextConfirmationStep(undefined, true, 2, SHORT)).toEqual({
      kind: 'unconfirmed',
    });
    expect(nextConfirmationStep(undefined, false, 2, SHORT)).toEqual({
      kind: 'unconfirmed',
    });
  });

  it('walks a whole unsuccessful run to the bound and no further', () => {
    const steps: string[] = [];
    for (let attemptsMade = 1; attemptsMade <= SHORT.attempts; attemptsMade++) {
      steps.push(nextConfirmationStep(false, true, attemptsMade, SHORT).kind);
    }
    expect(steps).toEqual(['retry', 'unconfirmed']);
  });
});

describe('the shipped policy', () => {
  it('spans several Hive blocks without stranding the reader', () => {
    // A block is 3s. Long enough for indexing lag, short enough that the
    // unconfirmed state is reached rather than being theoretical.
    expect(MEMBERSHIP_CONFIRMATION.intervalMs).toBeGreaterThanOrEqual(3000);
    expect(MEMBERSHIP_CONFIRMATION.attempts).toBeGreaterThanOrEqual(3);
    expect(confirmationBudgetMs()).toBeGreaterThanOrEqual(15000);
    expect(confirmationBudgetMs()).toBeLessThanOrEqual(60000);
  });

  it('is bounded, so a run always terminates', () => {
    expect(Number.isFinite(MEMBERSHIP_CONFIRMATION.attempts)).toBe(true);
    expect(
      nextConfirmationStep(false, true, MEMBERSHIP_CONFIRMATION.attempts).kind,
    ).toBe('unconfirmed');
  });
});
