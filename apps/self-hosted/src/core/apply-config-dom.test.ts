// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyConfigDom,
  CONFIG_DOM_DECLARATION,
  type ConfigDomDeclaration,
  restoreConfigDom,
  snapshotConfigDom,
} from './apply-config-dom';

function background(value: string) {
  return { configuration: { general: { styles: { background: value } } } };
}

const FULL_CONFIG = {
  configuration: {
    general: {
      theme: 'dark',
      styleTemplate: 'magazine',
      language: 'fr',
      styles: { background: 'bg-slate-900 from-black to-slate-800' },
    },
    instanceConfiguration: {
      type: 'community',
      meta: { title: 'A community' },
      layout: {
        listType: 'list',
        sidebar: {
          placement: 'left',
          followers: { enabled: false },
          following: { enabled: true },
          hiveInformation: {},
        },
      },
    },
  },
};

beforeEach(() => {
  // Flush the module's record of the classes it applied, then wipe the
  // document so each test starts from a page that carries nothing from config.
  applyConfigDom({});
  const root = document.documentElement;
  for (const attribute of Array.from(root.attributes)) {
    root.removeAttribute(attribute.name);
  }
  document.body.className = '';
  document.title = 'Ecency Blog';
  // jsdom does not implement matchMedia; tests that need it install a stub.
  (window as { matchMedia?: unknown }).matchMedia = undefined;
});

describe('applyConfigDom', () => {
  it('applies every declared attribute, the background and the title', () => {
    applyConfigDom(FULL_CONFIG);

    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-style-template')).toBe('magazine');
    expect(root.getAttribute('lang')).toBe('fr');
    expect(root.getAttribute('data-language')).toBe('fr');
    expect(root.getAttribute('data-sidebar-placement')).toBe('left');
    expect(root.getAttribute('data-list-type')).toBe('list');
    expect(root.getAttribute('data-instance-type')).toBe('community');
    expect(root.getAttribute('data-show-followers')).toBe('false');
    expect(root.getAttribute('data-show-following')).toBe('true');
    expect(root.getAttribute('data-show-hive-info')).toBe('true');
    expect(Array.from(document.body.classList).sort()).toEqual([
      'bg-slate-900',
      'from-black',
      'to-slate-800',
    ]);
    expect(document.title).toBe('A community');
  });

  it('uses one set of defaults for missing and blank values', () => {
    // The boot path used ?? and the preview path used ||, so an empty string
    // reached the DOM on boot (matching no stylesheet) while preview showed
    // the default. A missing theme reached the DOM as the string "undefined".
    applyConfigDom({
      configuration: {
        general: { styleTemplate: '', language: '   ' },
        instanceConfiguration: { type: '', layout: { listType: '' } },
      },
    });

    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.getAttribute('data-style-template')).toBe('medium');
    expect(root.getAttribute('lang')).toBe('en');
    expect(root.getAttribute('data-language')).toBe('en');
    expect(root.getAttribute('data-sidebar-placement')).toBe('right');
    expect(root.getAttribute('data-list-type')).toBe('grid');
    expect(root.getAttribute('data-instance-type')).toBe('blog');
    expect(root.getAttribute('data-show-followers')).toBe('true');
  });

  it('resolves the system theme against the OS preference', () => {
    (window as { matchMedia?: unknown }).matchMedia = () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    });

    applyConfigDom({ configuration: { general: { theme: 'system' } } });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('replaces config owned background classes instead of stacking them', () => {
    document.body.className = 'app-shell';

    applyConfigDom(background('bg-white from-white to-gray-100'));
    applyConfigDom(background('bg-black'));

    expect(Array.from(document.body.classList).sort()).toEqual([
      'app-shell',
      'bg-black',
    ]);
  });

  it('keeps the current title when the config carries none', () => {
    applyConfigDom({
      configuration: { instanceConfiguration: { meta: { title: '' } } },
    });

    expect(document.title).toBe('Ecency Blog');
  });
});

describe('snapshotConfigDom / restoreConfigDom', () => {
  it('restores the exact pre preview state, including absent attributes', () => {
    // A booted page carries no data-language, and only some of the declared
    // attributes. Restoring by writing a default back left the preview's
    // attributes on the document forever.
    document.documentElement.setAttribute('data-theme', 'light');
    document.body.className = 'app-shell';
    document.title = 'Owner blog';

    const snapshot = snapshotConfigDom();
    applyConfigDom(FULL_CONFIG);
    expect(document.documentElement.getAttribute('data-language')).toBe('fr');

    restoreConfigDom(snapshot);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    for (const { attribute } of CONFIG_DOM_DECLARATION.attributes) {
      if (attribute === 'data-theme') continue;
      expect(
        `${attribute}=${document.documentElement.getAttribute(attribute)}`,
      ).toBe(`${attribute}=null`);
    }
    expect(Array.from(document.body.classList)).toEqual(['app-shell']);
    expect(document.title).toBe('Owner blog');
  });

  it('restores the previous value of an attribute that was present', () => {
    applyConfigDom({
      configuration: {
        general: { theme: 'light', styleTemplate: 'minimal' },
        instanceConfiguration: { layout: { listType: 'grid' } },
      },
    });

    const snapshot = snapshotConfigDom();
    applyConfigDom(FULL_CONFIG);
    restoreConfigDom(snapshot);

    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.getAttribute('data-style-template')).toBe('minimal');
    expect(root.getAttribute('data-list-type')).toBe('grid');
  });

  it('replaces a background class that carries no declared prefix', () => {
    applyConfigDom(background('owner-skin'));
    const snapshot = snapshotConfigDom();
    applyConfigDom(background('preview-skin'));
    restoreConfigDom(snapshot);

    applyConfigDom(background('next-skin'));

    expect(Array.from(document.body.classList)).toEqual(['next-skin']);
  });
});

describe('declared CSS variables', () => {
  // Nothing is driven by an inline custom property yet, so the declaration is
  // exercised here with the shape a future knob (accent color, font preset)
  // will take.
  const declaration: ConfigDomDeclaration = {
    ...CONFIG_DOM_DECLARATION,
    cssVariables: [
      {
        variable: '--instance-accent',
        resolve: (read) => {
          const value = read('configuration.general.styles.accent');
          return typeof value === 'string' && value.length > 0 ? value : null;
        },
      },
    ],
  };

  const accent = (value: string) => ({
    configuration: { general: { styles: { accent: value } } },
  });

  it('sets the property and removes it again when it was not set before', () => {
    const snapshot = snapshotConfigDom(declaration);

    applyConfigDom(accent('#ff0000'), { declaration });
    expect(
      document.documentElement.style.getPropertyValue('--instance-accent'),
    ).toBe('#ff0000');

    restoreConfigDom(snapshot);
    expect(
      document.documentElement.style.getPropertyValue('--instance-accent'),
    ).toBe('');
  });

  it('restores the value the property had before preview', () => {
    document.documentElement.style.setProperty('--instance-accent', '#0000ff');

    const snapshot = snapshotConfigDom(declaration);
    applyConfigDom(accent('#ff0000'), { declaration });
    restoreConfigDom(snapshot);

    expect(
      document.documentElement.style.getPropertyValue('--instance-accent'),
    ).toBe('#0000ff');
  });
});
