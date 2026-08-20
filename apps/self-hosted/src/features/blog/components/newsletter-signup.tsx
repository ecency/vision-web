import { type FormEvent, type ReactElement, useEffect, useRef, useState } from 'react';
import { InstanceConfigManager } from '../../../core/configuration-loader';
import { t } from '../../../core/i18n';
import { LiveRegion } from '../../shared/live-region';
import { Turnstile, type TurnstileHandle } from '../../shared/turnstile';
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

/**
 * Where the form is being rendered. Only the frame differs: `sidebar` is the
 * rail section it was born as, `page` is the wider block the About page shows
 * (vision-web#1551), which is the only surface every template has. The rules,
 * the request and the states are identical in both.
 */
export type NewsletterPlacement = 'sidebar' | 'page';

interface Frame {
  root: string;
  /**
   * The heading ELEMENT, not just its size. In the rail nothing outranks it,
   * so h3 is fine; the About page opens with an h1 for the account or
   * community, and jumping straight to h3 would skip a level on the one page
   * here that has a real heading outline.
   */
  heading: 'h2' | 'h3';
  title: string;
  blurb: string;
  /**
   * The rail is narrow enough to be its own measure. The About column is 3xl
   * prose, where a full-width email field looks like a mistake.
   */
  form: string;
}

const FRAME: Record<NewsletterPlacement, Frame> = {
  sidebar: {
    root: 'border-t border-theme pt-4 mt-4 sidebar-newsletter-section',
    heading: 'h3',
    title: 'text-sm font-semibold mb-1',
    blurb: 'text-xs text-theme-muted mb-2',
    form: 'flex flex-col gap-2',
  },
  page: {
    root: 'max-w-3xl mx-auto border-t border-theme pt-6 mt-10 page-newsletter-section',
    heading: 'h2',
    title: 'heading-theme text-xl mb-1',
    blurb: 'text-theme-secondary leading-relaxed mb-4',
    form: 'flex flex-col gap-2 max-w-md',
  },
};

export function NewsletterSignup({
  placement = 'sidebar',
}: { placement?: NewsletterPlacement } = {}): ReactElement | null {
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

  const root = useRef<HTMLDivElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const emailField = useRef<HTMLInputElement>(null);
  /**
   * Set only for the two transitions that REMOVE whatever holds focus: the
   * form being replaced by the confirmation, and the confirmation being
   * replaced by the form again. Never on first render, or the page would hand
   * focus to a sidebar form the moment it loads.
   */
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef<TurnstileHandle>(null);

  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    const next = state === 'done' ? resetButton.current : state === 'idle' ? emailField.current : null;
    if (!next) return;
    // The browser drops focus to <body> when the focused element is removed,
    // so that (or focus still inside this form) means the reader was here and
    // has nowhere to stand. Anything else means they moved on while the
    // request was in flight, and their place is theirs to keep.
    const active = document.activeElement;
    if (active && active !== document.body && !root.current?.contains(active)) return;
    // Without preventScroll, a reader who has scrolled away from the form is
    // yanked back to it by a request they may have forgotten about.
    next.focus({ preventScroll: true });
  }, [state]);

  if (!target) return null;
  const isCommunity = target.type === 'community';
  const frame = FRAME[placement];
  const Heading = frame.heading;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (state === 'busy' || !email.trim() || !captchaToken) return;
    setState('busy');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newsletterSubscribeBody(target, email, cadence, captchaToken)),
      });
      if (!mounted.current) return;
      // Only success swaps the form out, so only success has focus to rescue.
      restoreFocus.current = res.ok;
      setState(res.ok ? 'done' : 'error');
      // The token is single use whatever the outcome, and a reader who retries with a
      // spent one gets the same generic error twice with nothing to act on.
      if (!res.ok) {
        setCaptchaToken('');
        turnstileRef.current?.reset();
      }
    } catch {
      if (mounted.current) {
        setState('error');
        setCaptchaToken('');
        turnstileRef.current?.reset();
      }
    }
  };

  /**
   * The way back from the confirmation (vision-web#1546). A typo gets the same
   * 2xx as a real address, because double opt-in means the service cannot tell
   * one from the other, so without this the reader waits for mail that will
   * never arrive and the only way out is reloading the page.
   */
  const useAnotherAddress = (): void => {
    restoreFocus.current = true;
    setEmail('');
    setState('idle');
    setCaptchaToken('');
    turnstileRef.current?.reset();
  };

  return (
    <div ref={root} className={frame.root} data-testid="newsletter-signup">
      <Heading className={frame.title}>{t('newsletterTitle')}</Heading>
      <p className={frame.blurb}>{t(isCommunity ? 'newsletterCommunityBlurb' : 'newsletterBlurb')}</p>
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
      {state === 'done' ? (
        <button
          type="button"
          ref={resetButton}
          onClick={useAnotherAddress}
          className="text-xs underline text-theme-muted"
        >
          {t('newsletterUseAnotherAddress')}
        </button>
      ) : (
        <form onSubmit={submit} className={frame.form}>
          <input
            type="email"
            required
            autoComplete="email"
            ref={emailField}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('newsletterEmail')}
            aria-label={t('newsletterEmail')}
            className="input-theme w-full text-sm px-2 py-1.5 rounded"
          />
          {/* Anonymous by definition here: a blog reader has no Ecency session, so the
              relay always wants a token. The submit stays disabled until one exists,
              which is also what happens when the script is blocked -- the widget then
              says so rather than failing at submit with a generic error. */}
          <Turnstile
            ref={turnstileRef}
            action="newsletter-subscribe"
            onVerify={setCaptchaToken}
            onExpire={() => setCaptchaToken('')}
            onError={() => setCaptchaToken('')}
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
              disabled={state === 'busy' || !captchaToken}
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
