// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The build-time config.json is generated at image build and gitignored, so it
 * does not exist in CI; the loader must be fed a stub before it is imported
 * (same pattern as config-merge-wiring.test.ts). BASE is hoisted so the mock
 * factory and the tests share one document.
 */
const BASE = vi.hoisted(() => ({
  version: 1,
  configuration: {
    general: {
      theme: 'light',
      styleTemplate: 'medium',
      language: 'en',
      styles: {},
    },
    instanceConfiguration: {
      type: 'blog',
      username: 'alice',
      owner: 'alice',
      meta: { title: 'Base blog' },
      layout: { sidebar: {} },
      features: { postsFilters: ['posts'] },
    },
  },
}));

vi.mock('../../config.json', () => ({ default: BASE }));

const { InstanceConfigManager } = await import('./configuration-loader');
const { endConfigPreview, previewConfigDraft } = await import(
  './config-preview'
);
const { applyConfigDom, CONFIG_DOM_DECLARATION, resetConfigDomBaseline } =
  await import('./apply-config-dom');
type InstanceConfig = import('./configuration-loader').InstanceConfig;

const DRAFT = {
  version: 1,
  configuration: {
    general: {
      theme: 'dark',
      styleTemplate: 'magazine',
      language: 'fr',
      styles: { accent: '#ff0000' },
    },
    instanceConfiguration: {
      type: 'blog',
      username: 'alice',
      owner: 'alice',
      meta: { title: 'Draft blog' },
      layout: { sidebar: {} },
      features: { postsFilters: ['posts'] },
    },
  },
} as unknown as InstanceConfig;

/** Everything the declaration owns, read straight off the document. */
function domState() {
  const root = document.documentElement;
  const attributes: Record<string, string | null> = {};
  for (const { attribute } of CONFIG_DOM_DECLARATION.attributes) {
    attributes[attribute] = root.getAttribute(attribute);
  }
  const cssVariables: Record<string, string> = {};
  for (const { variable } of CONFIG_DOM_DECLARATION.cssVariables) {
    cssVariables[variable] = root.style.getPropertyValue(variable);
  }
  return { attributes, cssVariables, title: document.title };
}

describe('config preview through the store', () => {
  beforeEach(() => {
    resetConfigDomBaseline();
    document.title = 'Booted';
    // The store is a module singleton: put the baseline back and drop any
    // overlay a previous case left behind, the way boot establishes it.
    InstanceConfigManager.updateConfig(
      structuredClone(BASE) as unknown as InstanceConfig,
    );
    applyConfigDom(InstanceConfigManager.getConfig());
  });

  it('serves the draft to every ordinary read and re-renders subscribers', () => {
    const listener = vi.fn();
    const store = InstanceConfigManager.getStore();
    const unsubscribe = store.subscribe(listener);

    previewConfigDraft(DRAFT);

    // Ordinary reads see the draft...
    expect(
      InstanceConfigManager.getConfigValue(
        ({ configuration }) => configuration.general.styleTemplate,
      ),
    ).toBe('magazine');
    // ...useSyncExternalStore consumers were told and get a new snapshot...
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(DRAFT);
    // ...and the DOM followed.
    const root = document.documentElement;
    expect(root.getAttribute('data-style-template')).toBe('magazine');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.getPropertyValue('--theme-accent')).toBe('#ff0000');
    expect(document.title).toBe('Draft blog');

    unsubscribe();
  });

  it('keeps the baseline underneath for identity reads', () => {
    const mallory = structuredClone(DRAFT) as unknown as {
      configuration: { instanceConfiguration: Record<string, unknown> };
    };
    mallory.configuration.instanceConfiguration.owner = 'mallory';
    mallory.configuration.instanceConfiguration.username = 'mallory';

    previewConfigDraft(mallory);

    // The overlay is what ordinary reads see...
    expect(
      InstanceConfigManager.getConfigValue(
        ({ configuration }) => configuration.instanceConfiguration.owner,
      ),
    ).toBe('mallory');
    // ...but authority reads answer from the baseline, so a drafted identity
    // cannot change who the owner is or which tenant a save targets.
    expect(
      InstanceConfigManager.getBaseConfigValue(
        ({ configuration }) =>
          configuration.instanceConfiguration.owner ||
          configuration.instanceConfiguration.username,
      ),
    ).toBe('alice');
  });

  it('ending preview restores exactly the pre-preview document, repeatedly', () => {
    const before = domState();
    const store = InstanceConfigManager.getStore();
    const baseline = store.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    for (let cycle = 0; cycle < 3; cycle++) {
      previewConfigDraft(DRAFT);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      endConfigPreview();
      expect(InstanceConfigManager.isPreviewing()).toBe(false);
      // The whole declared surface is back, including properties that were
      // absent before preview (the accent must be REMOVED, not blanked).
      expect(domState()).toEqual(before);
      // Subscribers were notified in BOTH directions (enter and exit) and the
      // snapshot they read is the baseline object again: without the exit
      // notify, React components would keep rendering the draft after the DOM
      // went back.
      expect(listener).toHaveBeenCalledTimes((cycle + 1) * 2);
      expect(store.getSnapshot()).toBe(baseline);
    }
    expect(
      InstanceConfigManager.getConfigValue(
        ({ configuration }) => configuration.general.styleTemplate,
      ),
    ).toBe('medium');
    unsubscribe();
  });

  it('ending twice is safe: exit button then unmount cleanup', () => {
    const before = domState();
    previewConfigDraft(DRAFT);
    endConfigPreview();
    endConfigPreview();
    expect(domState()).toEqual(before);
    expect(InstanceConfigManager.isPreviewing()).toBe(false);
  });

  it('a save while previewing becomes the baseline and drops the overlay', () => {
    previewConfigDraft(DRAFT);

    const saved = structuredClone(BASE) as unknown as {
      configuration: { instanceConfiguration: { meta: { title: string } } };
    };
    saved.configuration.instanceConfiguration.meta.title = 'Saved blog';
    InstanceConfigManager.updateConfig(saved as unknown as InstanceConfig);

    // The overlay is gone without an explicit endConfigPreview, so exiting
    // preview later cannot roll the document back past the save.
    expect(InstanceConfigManager.isPreviewing()).toBe(false);
    expect(
      InstanceConfigManager.getConfigValue(
        ({ configuration }) => configuration.instanceConfiguration.meta.title,
      ),
    ).toBe('Saved blog');
    expect(InstanceConfigManager.getBaseConfig()).toBe(saved);
  });

  it('clearing without an active overlay does not notify subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = InstanceConfigManager.getStore().subscribe(listener);
    InstanceConfigManager.clearPreviewConfig();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  describe('system-theme listener across preview', () => {
    /**
     * jsdom has no matchMedia, so syncSystemTheme is inert in every other
     * case. This stub makes the OS theme controllable: flip() plays an OS
     * appearance change into whatever listener applyConfigDom registered.
     */
    function stubMatchMedia() {
      const listeners = new Set<(event: { matches: boolean }) => void>();
      let matches = false;
      const mql = {
        get matches() {
          return matches;
        },
        addEventListener: (
          _type: string,
          fn: (event: { matches: boolean }) => void,
        ) => listeners.add(fn),
        removeEventListener: (
          _type: string,
          fn: (event: { matches: boolean }) => void,
        ) => listeners.delete(fn),
      };
      window.matchMedia = (() => mql) as unknown as typeof window.matchMedia;
      return {
        flip(next: boolean) {
          matches = next;
          for (const fn of listeners) fn({ matches: next });
        },
        listenerCount: () => listeners.size,
        cleanup() {
          // Re-apply a fixed-theme document with sync on, which removes any
          // registered listener, then drop the stub so later cases see the
          // plain jsdom environment again.
          applyConfigDom(structuredClone(BASE), { syncSystemTheme: true });
          window.matchMedia = undefined as unknown as typeof window.matchMedia;
        },
      };
    }

    function withTheme(theme: string) {
      const doc = structuredClone(BASE) as unknown as {
        configuration: { general: Record<string, unknown> };
      };
      doc.configuration.general.theme = theme;
      return doc;
    }

    it('an OS flip cannot overwrite a previewed fixed theme', () => {
      const os = stubMatchMedia();
      try {
        // Baseline follows the OS: boot registers the listener.
        const systemBase = withTheme('system');
        InstanceConfigManager.updateConfig(
          systemBase as unknown as InstanceConfig,
        );
        applyConfigDom(systemBase, { syncSystemTheme: true });
        expect(os.listenerCount()).toBe(1);

        // Previewing a FIXED theme suspends the OS listener for the duration.
        previewConfigDraft(withTheme('dark'));
        expect(document.documentElement.getAttribute('data-theme')).toBe(
          'dark',
        );
        expect(os.listenerCount()).toBe(0);
        os.flip(false);
        expect(document.documentElement.getAttribute('data-theme')).toBe(
          'dark',
        );

        // Exiting re-synchronizes to the baseline: system again, listener back.
        endConfigPreview();
        expect(os.listenerCount()).toBe(1);
        os.flip(true);
        expect(document.documentElement.getAttribute('data-theme')).toBe(
          'dark',
        );
        os.flip(false);
        expect(document.documentElement.getAttribute('data-theme')).toBe(
          'light',
        );
      } finally {
        os.cleanup();
      }
    });

    it('previewing system over a fixed baseline follows the OS, then stops', () => {
      const os = stubMatchMedia();
      try {
        // BASE is theme light: fixed, so no listener after baseline apply.
        applyConfigDom(InstanceConfigManager.getBaseConfig(), {
          syncSystemTheme: true,
        });
        expect(os.listenerCount()).toBe(0);

        previewConfigDraft(withTheme('system'));
        expect(os.listenerCount()).toBe(1);
        os.flip(true);
        expect(document.documentElement.getAttribute('data-theme')).toBe(
          'dark',
        );

        endConfigPreview();
        expect(os.listenerCount()).toBe(0);
        expect(document.documentElement.getAttribute('data-theme')).toBe(
          'light',
        );
      } finally {
        os.cleanup();
      }
    });
  });
});
