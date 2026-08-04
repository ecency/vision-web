// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyConfigDom,
  CONFIG_DOM_DECLARATION,
  type ConfigDomDeclaration,
  resetConfigDomBaseline,
  restoreConfigDom,
  snapshotConfigDom,
} from './apply-config-dom';
import { FONT_PRESETS } from './theme-appearance';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function declaredVariables(): string[] {
  return CONFIG_DOM_DECLARATION.cssVariables.map(({ variable }) => variable);
}

function inlineVariables(): Record<string, string> {
  const root = document.documentElement;
  const out: Record<string, string> = {};
  for (const variable of declaredVariables()) {
    const value = root.style.getPropertyValue(variable);
    if (value !== '') out[variable] = value;
  }
  return out;
}

function styles(value: Record<string, unknown>) {
  return { configuration: { general: { styles: value } } };
}

function configWithTitle(title: string) {
  return { configuration: { instanceConfiguration: { meta: { title } } } };
}

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

  it('shows the boot title when the config carries none', () => {
    // The baseline is captured on the first apply, so this states which title
    // the document booted with rather than relying on an earlier test's state.
    resetConfigDomBaseline();
    document.title = 'Ecency Blog';

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

describe('the appearance knobs', () => {
  /**
   * The claim this file exists to pin: no instance changes because these knobs
   * shipped. Nothing is written to any tenant document, and every config on
   * disk carries neither field, so every resolver reads undefined and every
   * property is removed rather than set.
   */
  it('sets nothing at all for the configs that are actually deployed', () => {
    const seeds: Array<[string, unknown]> = [
      [
        'config.template.json',
        JSON.parse(readFileSync(join(APP, 'config.template.json'), 'utf8')),
      ],
      [
        'hosting/default-config.json',
        JSON.parse(
          readFileSync(join(APP, 'hosting', 'default-config.json'), 'utf8'),
        ),
      ],
    ];

    for (const [name, seed] of seeds) {
      applyConfigDom(seed);
      expect(`${name}: ${JSON.stringify(inlineVariables())}`).toBe(
        `${name}: {}`,
      );
    }
  });

  it('is absent from the document the hosting API seeds', () => {
    // getDefaultConfig is only exercised at tenant creation, so the seed is
    // read as source here rather than imported: a styles block that gained an
    // accent would put a colour on every new instance without anyone choosing
    // it.
    const source = readFileSync(
      join(APP, 'hosting', 'api', 'src', 'services', 'tenant-service.ts'),
      'utf8',
    );
    const seeded = /styles:\s*\{([\s\S]*?)\}/.exec(source);

    expect(seeded).not.toBeNull();
    expect(seeded?.[1]).toContain('background:');
    expect(seeded?.[1]).not.toContain('accent');
    expect(seeded?.[1]).not.toContain('fontPreset');
  });

  it('treats every unusable value exactly as it treats absence', () => {
    // '' is the only "unset" the editor can produce, so it has to mean the same
    // thing as a key that was never written; the rest are what the server will
    // happily store and the client must refuse to put on the page. An accent
    // that reached CSS as `banana` would make every
    // `background-color: var(--theme-accent)` invalid at computed-value time.
    for (const accent of [
      '',
      '   ',
      null,
      'banana',
      'rgb(0, 0, 0)',
      'var(--x)',
      '#12345',
      '#8b4513ff',
      123,
      {},
      [],
    ]) {
      applyConfigDom(styles({ accent }));
      expect(
        `${JSON.stringify(accent)}: ${JSON.stringify(inlineVariables())}`,
      ).toBe(`${JSON.stringify(accent)}: {}`);
    }

    for (const fontPreset of ['', 'comic-sans', 'toString', 42, null]) {
      applyConfigDom(styles({ fontPreset }));
      expect(
        `${JSON.stringify(fontPreset)}: ${JSON.stringify(inlineVariables())}`,
      ).toBe(`${JSON.stringify(fontPreset)}: {}`);
    }
  });

  it('writes one colour as the five values the page reads', () => {
    applyConfigDom(styles({ accent: '#8B4513' }));

    const inline = inlineVariables();
    expect(inline['--theme-accent']).toBe('#8b4513');
    expect(inline['--theme-accent-contrast']).toBe('#ffffff');
    // The hover is a constant string containing var(--theme-accent-shade), so
    // an OS flip re-substitutes it with no JS and no stale value.
    expect(inline['--theme-accent-hover']).toContain(
      'var(--theme-accent-shade)',
    );
    // Both mode variants are written and CSS picks, which is what lets the
    // system-theme listener stay untouched and a preview survive an OS flip.
    expect(inline['--theme-accent-text-light']).toBe('#8b4513');
    expect(inline['--theme-accent-text-dark']).not.toBe(
      inline['--theme-accent-text-light'],
    );
    expect(inline['--theme-font-body']).toBeUndefined();
  });

  it('writes all three faces for a pairing, never one of them', () => {
    applyConfigDom(styles({ fontPreset: 'technical' }));

    const inline = inlineVariables();
    expect(inline['--theme-font-body']).toBe(FONT_PRESETS.technical.body);
    expect(inline['--theme-font-heading']).toBe(FONT_PRESETS.technical.heading);
    expect(inline['--theme-font-ui']).toBe(FONT_PRESETS.technical.ui);
    expect(inline['--theme-accent']).toBeUndefined();
  });

  it('clears everything again when the owner clears the field', () => {
    applyConfigDom(styles({ accent: '#8b4513', fontPreset: 'classic' }));
    expect(Object.keys(inlineVariables()).length).toBe(
      declaredVariables().length,
    );

    applyConfigDom(styles({ accent: '', fontPreset: '' }));
    expect(inlineVariables()).toEqual({});
  });

  it('is snapshotted and restored without naming a single property', () => {
    // Preview is generic over the declaration, so a knob added without a
    // restore path fails here rather than leaking styling out of preview.
    const snapshot = snapshotConfigDom();
    expect(Object.keys(snapshot.cssVariables).sort()).toEqual(
      declaredVariables().sort(),
    );

    applyConfigDom(styles({ accent: '#7c3aed', fontPreset: 'modern' }));
    restoreConfigDom(snapshot);

    expect(inlineVariables()).toEqual({});
  });

  it('writes only properties a stylesheet reads', () => {
    // Nine token families shipped with no consumer the last time appearance
    // work landed here. A property nothing reads is a knob that does nothing.
    const stylesheets: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.css'))
          stylesheets.push(readFileSync(path, 'utf8'));
      }
    };
    walk(join(APP, 'src', 'styles'));

    const unread = declaredVariables().filter(
      (variable) => !stylesheets.some((css) => css.includes(`var(${variable}`)),
    );
    expect(unread).toEqual([]);
  });
});

describe('the configured theme', () => {
  it('is matched case-insensitively', () => {
    // text() neither lowercased nor validated, so `theme: "Dark"` reached the
    // document as data-theme="Dark", which matches no block in any stylesheet:
    // the instance asked for dark and rendered light.
    applyConfigDom({ configuration: { general: { theme: 'Dark' } } });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    applyConfigDom({ configuration: { general: { theme: ' LIGHT ' } } });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('never reaches the document as a value no block matches', () => {
    for (const theme of ['sepia', 'Dark mode', 'system ', 42, {}, null, '']) {
      applyConfigDom({ configuration: { general: { theme } } });
      expect(
        `${JSON.stringify(theme)}: ${document.documentElement.getAttribute('data-theme')}`,
      ).toMatch(/: (light|dark)$/);
    }
  });

  it('follows the operating system whatever case it is written in', () => {
    let listening = false;
    (window as { matchMedia?: unknown }).matchMedia = () => ({
      matches: true,
      addEventListener() {
        listening = true;
      },
      removeEventListener() {},
    });

    applyConfigDom(
      { configuration: { general: { theme: 'System' } } },
      { syncSystemTheme: true },
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(listening).toBe(true);
  });
});

describe('document title round trip', () => {
  beforeEach(() => {
    resetConfigDomBaseline();
    document.title = 'Ecency Blog';
  });

  /**
   * An empty configured title means the owner cleared it, which is not the same
   * as "leave whatever is on the document". Returning early left the old title
   * on screen, so the change could not be previewed and read as a failed save.
   */
  it('falls back to the boot title when the owner clears it', () => {
    applyConfigDom(configWithTitle('My Blog'));
    expect(document.title).toBe('My Blog');

    applyConfigDom(configWithTitle(''));
    expect(document.title).toBe('Ecency Blog');
  });

  it('does not adopt a configured title as the baseline', () => {
    // The first apply carries a title, so the baseline must still be the one
    // the document booted with, not the configured one.
    applyConfigDom(configWithTitle('My Blog'));
    applyConfigDom(configWithTitle('Renamed'));
    applyConfigDom(configWithTitle(''));

    expect(document.title).toBe('Ecency Blog');
  });

  it('applies a title on every apply, not only the first', () => {
    applyConfigDom(configWithTitle('One'));
    applyConfigDom(configWithTitle('Two'));

    expect(document.title).toBe('Two');
  });
});
