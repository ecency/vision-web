// @vitest-environment jsdom

import type { ReactElement } from 'react';
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type InstanceConfig,
  InstanceConfigManager,
} from '../../../core/configuration-loader';
import { NewsletterSignup } from './newsletter-signup';

/**
 * The component half of the signup form (vision-web#1537). The pure rules live
 * in newsletter-signup-target.test.ts; this covers what only a rendered
 * component can show: the eligibility fence, the request the submit actually
 * sends, and the three visible outcomes (busy, done, error).
 *
 * No test library: React 19's own `act` plus react-dom/client drive it, so the
 * app keeps its current devDependencies.
 */

// React 19 only suppresses its "not wrapped in act(...)" warning when the
// environment flag is set, and `act` itself throws without it.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** A managed, claimed blog: the one shape that offers the form. */
const MANAGED_BLOG = {
  version: 1,
  configuration: {
    general: { theme: 'system', language: 'en', styles: {} },
    instanceConfiguration: {
      type: 'blog',
      username: 'Alice',
      managed: true,
      communityId: '',
      meta: {
        title: 'Alice Writes',
        description: '',
        logo: '',
        favicon: '',
        keywords: '',
      },
      layout: {
        search: { enabled: true },
        sidebar: {
          followers: { enabled: true },
          following: { enabled: true },
          hiveInformation: { enabled: true },
        },
      },
      features: {
        postsFilters: ['posts'],
        likes: { enabled: true },
        comments: { enabled: true },
        post: { text2Speech: { enabled: false } },
        auth: { enabled: true, methods: [] },
      },
    },
  },
} as unknown as InstanceConfig;

/** MANAGED_BLOG with one instanceConfiguration field changed or removed. */
function configWith(
  patch: Record<string, unknown>,
  drop?: string,
): InstanceConfig {
  const next = structuredClone(MANAGED_BLOG) as InstanceConfig;
  const instance = next.configuration
    .instanceConfiguration as unknown as Record<string, unknown>;
  Object.assign(instance, patch);
  if (drop) delete instance[drop];
  return next;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;
let unmounted = false;

async function render(
  node: ReactElement = <NewsletterSignup />,
): Promise<void> {
  await act(async () => {
    root.render(node);
  });
}

/**
 * Wrapped in act because updateConfig notifies the store's listeners
 * synchronously, and an already-mounted component reads it through
 * useSyncExternalStore: an unwrapped call re-renders outside act and warns.
 */
async function setConfig(config: InstanceConfig): Promise<void> {
  await act(async () => {
    InstanceConfigManager.updateConfig(config);
  });
}

/**
 * Set a controlled input the way a keystroke does. Assigning `.value` alone is
 * invisible to React: it goes through the prototype setter React has shadowed
 * to track the value, so React sees no change and the state never updates.
 */
async function typeInto(
  el: HTMLInputElement | HTMLSelectElement | null,
  value: string,
): Promise<void> {
  if (!el) throw new Error('typeInto: the field is not rendered');
  const prototype =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    // React listens for 'input' on text inputs and 'change' on selects, both at
    // the root container, so the event has to bubble.
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? 'change' : 'input', {
        bubbles: true,
      }),
    );
  });
}

/**
 * jsdom implements no form submission, so a submit-button click would only warn
 * ("Not implemented"). Dispatching the event React delegates on is the honest
 * equivalent: cancelable, because the handler calls preventDefault.
 */
async function submitForm(): Promise<void> {
  const form = container.querySelector('form');
  await act(async () => {
    form?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
}

const form = () => container.querySelector('form');
const emailInput = () =>
  container.querySelector<HTMLInputElement>('input[type="email"]');
const cadenceSelect = () =>
  container.querySelector<HTMLSelectElement>('select');
const submitButton = () =>
  container.querySelector<HTMLButtonElement>('button[type="submit"]');
// Two regions, because a failure has to interrupt: role=status is the polite
// one (the confirmation), role=alert the assertive one (the failure).
const politeRegion = () => container.querySelector('[role="status"]');
const errorRegion = () => container.querySelector('[role="alert"]');

describe('NewsletterSignup', () => {
  beforeEach(() => {
    InstanceConfigManager.updateConfig(
      structuredClone(MANAGED_BLOG) as InstanceConfig,
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    unmounted = false;
  });

  afterEach(async () => {
    if (!unmounted) {
      await act(async () => {
        root.unmount();
      });
    }
    container.remove();
    vi.unstubAllGlobals();
  });

  it('renders nothing unless the instance is managed, claimed and has the feature on', async () => {
    // A true self-host: no managed marker at all.
    await setConfig(configWith({}, 'managed'));
    await render();
    expect(container.innerHTML).toBe('');

    // The unclaimed shared template, served as managed but not a tenant.
    await setConfig(configWith({ template: true }));
    await render();
    expect(container.innerHTML).toBe('');

    // The owner's own toggle.
    await setConfig(
      configWith({
        features: {
          ...MANAGED_BLOG.configuration.instanceConfiguration.features,
          newsletter: { enabled: false },
        },
      }),
    );
    await render();
    expect(container.innerHTML).toBe('');

    // And the eligible instance does render, so the assertions above are not
    // passing on a component that never renders anything.
    await setConfig(structuredClone(MANAGED_BLOG) as InstanceConfig);
    await render();
    expect(
      container.querySelector('[data-testid="newsletter-signup"]'),
    ).not.toBeNull();
  });

  it('mounts both live regions empty from the first render', async () => {
    await render();
    // A region has to be in the accessibility tree BEFORE its first message, or
    // the message is usually not announced (live-region.tsx contract).
    expect(politeRegion()?.getAttribute('aria-live')).toBe('polite');
    expect(politeRegion()?.textContent).toBe('');
    // The failure interrupts. Announced politely it waits for a pause, and a
    // reader who has moved on never learns the address was not captured.
    expect(errorRegion()?.getAttribute('aria-live')).toBe('assertive');
    expect(errorRegion()?.textContent).toBe('');
  });

  it('names the two form controls differently and asks the browser for the saved address', async () => {
    await render();
    // The select used to borrow the button's label, so a reader tabbing the
    // form heard "Subscribe, combo box" then "Subscribe, button" and was never
    // told what the first control does.
    expect(cadenceSelect()?.getAttribute('aria-label')).toBe('How often');
    expect(submitButton()?.textContent).toBe('Subscribe');
    expect(cadenceSelect()?.getAttribute('aria-label')).not.toBe(
      submitButton()?.textContent,
    );
    expect(emailInput()?.getAttribute('aria-label')).toBe('Your email');
    expect(emailInput()?.getAttribute('autocomplete')).toBe('email');
  });

  it('posts the subscription, goes busy, then replaces the form with the confirm-your-inbox message', async () => {
    const pending = deferred<{ ok: boolean }>();
    // The parameters are declared, unused, so mock.calls is typed and the
    // request can be read back without a cast.
    const fetchMock = vi.fn(
      (_url: string, _init: RequestInit) => pending.promise,
    );
    vi.stubGlobal('fetch', fetchMock);

    await render();
    await typeInto(emailInput(), '  reader@example.com  ');
    await typeInto(cadenceSelect(), 'monthly');
    await submitForm();

    // In flight: the form is still up and the button says so. `disabled` alone
    // is not announced, so aria-busy is what a screen reader user gets.
    expect(submitButton()?.disabled).toBe(true);
    expect(submitButton()?.getAttribute('aria-busy')).toBe('true');
    expect(form()).not.toBeNull();
    expect(politeRegion()?.textContent).toBe('');
    expect(errorRegion()?.textContent).toBe('');

    // A second submit while the first is in flight is dropped by the handler.
    // The disabled button is only the visible half of that guard: a form can
    // still be submitted with the keyboard while its button is disabled.
    await submitForm();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/newsletter/subscribe');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'reader@example.com',
      type: 'creator',
      target: 'alice',
      targetLabel: 'Alice Writes',
      cadence: 'monthly',
      source: 'self-hosted-blog',
    });

    await act(async () => {
      pending.resolve({ ok: true });
    });

    expect(form()).toBeNull();
    expect(politeRegion()?.textContent).toBe(
      'Almost there: confirm from the email we just sent.',
    );
    expect(errorRegion()?.textContent).toBe('');
  });

  it('keeps the form and shows the error message when the relay answers non-2xx', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 502 }));
    vi.stubGlobal('fetch', fetchMock);

    await render();
    await typeInto(emailInput(), 'reader@example.com');
    await submitForm();

    expect(errorRegion()?.textContent).toBe(
      'Could not subscribe right now. Please try again.',
    );
    expect(politeRegion()?.textContent).toBe('');
    // Still submittable: the reader can retry without losing what they typed.
    expect(form()).not.toBeNull();
    expect(submitButton()?.disabled).toBe(false);
    expect(submitButton()?.getAttribute('aria-busy')).toBe('false');
    expect(emailInput()?.value).toBe('reader@example.com');
  });

  it('shows the same error when the request never completes', async () => {
    // The return type is annotated so the successful retry below can be given
    // as an implementation: inferred, the throwing body types it Promise<never>.
    const fetchMock = vi.fn(async (): Promise<{ ok: boolean }> => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    await render();
    await typeInto(emailInput(), 'reader@example.com');
    await submitForm();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorRegion()?.textContent).toBe(
      'Could not subscribe right now. Please try again.',
    );
    expect(form()).not.toBeNull();

    // A retry that succeeds clears the error.
    fetchMock.mockImplementation(async () => ({ ok: true }));
    await submitForm();
    expect(form()).toBeNull();
    expect(politeRegion()?.textContent).toBe(
      'Almost there: confirm from the email we just sent.',
    );
    expect(errorRegion()?.textContent).toBe('');
  });

  it('sends nothing for an empty address', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await render();
    await submitForm();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(form()).not.toBeNull();
  });

  it('a hive-… instance subscribes to the community digest and reads the community blurb', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
    }));
    vi.stubGlobal('fetch', fetchMock);
    await setConfig(configWith({ username: 'hive-125125' }));

    await render();
    expect(container.textContent).toContain('The best of this community');

    await typeInto(emailInput(), 'reader@example.com');
    await submitForm();

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({
      type: 'community',
      target: 'hive-125125',
      targetLabel: 'Alice Writes',
      cadence: 'weekly',
    });
  });

  it('completes a submit under StrictMode, which mounts every effect twice', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await render(
      <StrictMode>
        <NewsletterSignup />
      </StrictMode>,
    );
    await typeInto(emailInput(), 'reader@example.com');
    await submitForm();

    // The unmount guard is a ref the effect sets back to true on the second
    // mount. Drop that one line and StrictMode leaves it false, so in
    // development every success is swallowed and the form just sits there.
    expect(form()).toBeNull();
    expect(politeRegion()?.textContent).toBe(
      'Almost there: confirm from the email we just sent.',
    );
  });

  it('survives an unmount mid-flight, and does not abort the request', async () => {
    const pending = deferred<{ ok: boolean }>();
    const fetchMock = vi.fn(
      (_url: string, _init: RequestInit) => pending.promise,
    );
    vi.stubGlobal('fetch', fetchMock);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await render();
    await typeInto(emailInput(), 'reader@example.com');
    await submitForm();

    // The reader follows a link while the request is still open.
    await act(async () => {
      root.unmount();
    });
    unmounted = true;
    await act(async () => {
      pending.resolve({ ok: true });
    });

    // Nothing throws and nothing is logged when the response lands after the
    // unmount. React 19 no longer warns about a state update on an unmounted
    // component, so this pins the behaviour rather than the warning; the
    // `mounted` ref is what keeps it true. And no AbortSignal: the
    // subscription the reader already asked for has to complete. An
    // AbortController here would cancel real subscriptions at exactly the
    // moment readers navigate away, and nothing else would notice.
    expect(consoleError).not.toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeUndefined();
    consoleError.mockRestore();
  });
});
