import { type FormEvent, type ReactElement, useEffect, useRef, useState } from 'react';
import { InstanceConfigManager } from '../../../core/configuration-loader';
import { t } from '../../../core/i18n';
import { LiveRegion } from '../../shared/live-region';
import { newsletterSignupTarget, newsletterSubscribeBody } from '../utils/newsletter-signup-target';

/**
 * The email-digest signup form (vision-web#1537). Managed instances only, by
 * two fences: the form renders only when the served config carries `managed`
 * (never on a true self-host or the unclaimed template), and it posts to the
 * host's own `/api/newsletter/subscribe`, a path only the managed nginx
 * forwards to ecency.com's public relay. Double opt-in end to end: the service
 * answers `pending_confirmation` and the reader confirms from their inbox, so
 * the form always says "check your inbox" on success and can learn nothing
 * about an address it does not own.
 */
export function NewsletterSignup(): ReactElement | null {
  const target = InstanceConfigManager.useConfig(({ configuration }) =>
    newsletterSignupTarget({
      username: configuration.instanceConfiguration.username,
      managed: configuration.instanceConfiguration.managed,
      template: configuration.instanceConfiguration.template,
      enabled: configuration.instanceConfiguration.features.newsletter?.enabled ?? true,
      siteTitle: configuration.instanceConfiguration.meta?.title,
    })
  );

  const [email, setEmail] = useState('');
  const [cadence, setCadence] = useState<'weekly' | 'monthly'>('weekly');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  // The submit awaits a network call; a navigation mid-flight must not update
  // an unmounted component.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!target) return null;
  const isCommunity = target.type === 'community';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === 'busy' || !email.trim()) return;
    setState('busy');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newsletterSubscribeBody(target, email, cadence)),
      });
      if (mounted.current) setState(res.ok ? 'done' : 'error');
    } catch {
      if (mounted.current) setState('error');
    }
  };

  return (
    <div className="border-t border-theme pt-4 mt-4 sidebar-newsletter-section" data-testid="newsletter-signup">
      <h3 className="text-sm font-semibold mb-1">{t('newsletterTitle')}</h3>
      <p className="text-xs text-theme-muted mb-2">{t(isCommunity ? 'newsletterCommunityBlurb' : 'newsletterBlurb')}</p>
      {/* Both regions are mounted from the first render, per the live-region
          contract: a region that appears at the same moment as its message is
          often not announced. Two of them, as community-join-button.tsx does,
          because a failure has to interrupt: announced politely, it waits for a
          pause and a reader who has moved on never learns the address was not
          captured. */}
      <LiveRegion message={state === 'done' ? t('newsletterCheckInbox') : null} className="text-xs block mb-1" />
      <LiveRegion
        urgency="assertive"
        message={state === 'error' ? t('newsletterError') : null}
        className="text-xs block mb-1 text-red-500 dark:text-red-400"
      />
      {state !== 'done' && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('newsletterEmail')}
            aria-label={t('newsletterEmail')}
            className="input-theme w-full text-sm px-2 py-1.5 rounded"
          />
          <div className="flex gap-2">
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as 'weekly' | 'monthly')}
              aria-label={t('newsletterCadence')}
              className="input-theme flex-1 text-sm px-2 py-1.5 rounded"
            >
              <option value="weekly">{t('newsletterWeekly')}</option>
              <option value="monthly">{t('newsletterMonthly')}</option>
            </select>
            <button
              type="submit"
              disabled={state === 'busy'}
              aria-busy={state === 'busy'}
              className="btn-theme-primary text-sm px-3 py-1.5 rounded disabled:opacity-60"
            >
              {t('newsletterSubscribe')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
