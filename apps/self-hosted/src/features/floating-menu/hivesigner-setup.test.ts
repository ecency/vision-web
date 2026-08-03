import { describe, expect, it } from 'vitest';
import {
  getHivesignerSetupNotice,
  HIVESIGNER_SETUP_NOTICE,
} from './hivesigner-setup';

function configWith(options: {
  methods?: unknown;
  enabled?: unknown;
  clientId?: unknown;
}) {
  return {
    configuration: {
      general:
        options.clientId === undefined
          ? {}
          : { hivesigner: { clientId: options.clientId } },
      instanceConfiguration: {
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
