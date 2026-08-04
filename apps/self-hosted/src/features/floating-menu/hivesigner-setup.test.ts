import { describe, expect, it } from 'vitest';
import {
  getHivesignerSetupNotice,
  HIVESIGNER_MANAGED_SETUP_NOTICE,
  HIVESIGNER_SETUP_NOTICE,
} from './hivesigner-setup';

function configWith(options: {
  methods?: unknown;
  enabled?: unknown;
  clientId?: unknown;
  managed?: unknown;
}) {
  return {
    configuration: {
      general:
        options.clientId === undefined
          ? {}
          : { hivesigner: { clientId: options.clientId } },
      instanceConfiguration: {
        ...(options.managed === undefined ? {} : { managed: options.managed }),
        features: {
          auth: {
            enabled: options.enabled ?? true,
            methods: options.methods ?? ['keychain'],
          },
        },
      },
    },
  };
}

/**
 * The gap this closes: the owner adds hivesigner, the save succeeds, and no
 * button ever appears, with nothing to tell "needs a step" from "broken".
 */
describe('hivesigner setup notice', () => {
  it('warns when hivesigner is offered but no client id is set', () => {
    expect(
      getHivesignerSetupNotice(configWith({ methods: ['hivesigner'] })),
    ).toBe(HIVESIGNER_SETUP_NOTICE);
  });

  it('tells the owner both routes and where to do each', () => {
    expect(HIVESIGNER_SETUP_NOTICE).toContain('General Settings > Hivesigner');
    expect(HIVESIGNER_SETUP_NOTICE).toContain('hello@ecency.com');
  });

  /**
   * On a managed blog the registration is performed by a scheduled job and the
   * client id is written only once it has landed, so the owner has nothing to
   * do. Sending them to support would be asking for something already under way.
   */
  it('tells a managed blog to wait rather than to email support', () => {
    const notice = getHivesignerSetupNotice(
      configWith({ methods: ['hivesigner'], managed: true }),
    );

    expect(notice).toBe(HIVESIGNER_MANAGED_SETUP_NOTICE);
    expect(notice).not.toContain('hello@ecency.com');
  });

  it('still offers the managed owner their own app as a way past the wait', () => {
    expect(HIVESIGNER_MANAGED_SETUP_NOTICE).toContain(
      'General Settings > Hivesigner',
    );
  });

  it('names the custom-domain case, the one time a working button goes away', () => {
    expect(HIVESIGNER_MANAGED_SETUP_NOTICE).toContain('custom domain');
  });

  it.each([
    ['absent', undefined],
    ['false', false],
    ['a string that merely looks true', 'true'],
  ])('keeps the self-hosted notice when managed is %s', (_label, managed) => {
    // `managed` is injected by the hosting service and never stored, so a
    // self-hosted config cannot claim a registration nobody will perform.
    expect(
      getHivesignerSetupNotice(configWith({ methods: ['hivesigner'], managed })),
    ).toBe(HIVESIGNER_SETUP_NOTICE);
  });

  it('says nothing on a managed blog once the client id has been written', () => {
    expect(
      getHivesignerSetupNotice(
        configWith({
          methods: ['hivesigner'],
          managed: true,
          clientId: 'ecency.app',
        }),
      ),
    ).toBe(null);
  });

  it('says nothing once the owner names their own app', () => {
    expect(
      getHivesignerSetupNotice(
        configWith({ methods: ['hivesigner'], clientId: 'myblog.app' }),
      ),
    ).toBe(null);
  });

  /**
   * Naming ecency.app is the second route, taken once the /auth address has
   * been registered on the shared app, and it is a deliberate choice rather
   * than the built-in default.
   */
  it('says nothing once the owner names the shared app', () => {
    expect(
      getHivesignerSetupNotice(
        configWith({ methods: ['hivesigner'], clientId: 'ecency.app' }),
      ),
    ).toBe(null);
  });

  it('still warns when the client id is blank or not text', () => {
    expect(
      getHivesignerSetupNotice(
        configWith({ methods: ['hivesigner'], clientId: '   ' }),
      ),
    ).toBe(HIVESIGNER_SETUP_NOTICE);
    expect(
      getHivesignerSetupNotice(
        configWith({ methods: ['hivesigner'], clientId: 42 }),
      ),
    ).toBe(HIVESIGNER_SETUP_NOTICE);
  });

  it('says nothing when hivesigner is not offered', () => {
    expect(
      getHivesignerSetupNotice(
        configWith({ methods: ['keychain', 'hiveauth'] }),
      ),
    ).toBe(null);
  });

  /** Login is off, so there is no missing button to explain. */
  it('says nothing when authentication is disabled', () => {
    expect(
      getHivesignerSetupNotice(
        configWith({ methods: ['hivesigner'], enabled: false }),
      ),
    ).toBe(null);
  });

  it('survives a config missing the sections it reads', () => {
    expect(getHivesignerSetupNotice({})).toBe(null);
    expect(getHivesignerSetupNotice(null)).toBe(null);
    expect(getHivesignerSetupNotice({ configuration: 'oops' })).toBe(null);
    expect(
      getHivesignerSetupNotice(configWith({ methods: 'hivesigner' })),
    ).toBe(null);
  });
});
