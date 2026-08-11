import { describe, expect, it } from 'vitest';
import { TenantService } from './tenant-service';

// Pure mapping: no DB, no RPC.

describe('normalizeFlatOverrides appearance keys', () => {
  it('maps accent and fontPreset under general.styles, the paths the editor writes', () => {
    const normalized = TenantService.normalizeFlatOverrides({
      styleTemplate: 'magazine',
      accent: '#ff6600',
      fontPreset: 'classic',
    });

    expect(normalized.configuration.general.styleTemplate).toBe('magazine');
    expect(normalized.configuration.general.styles).toEqual({
      accent: '#ff6600',
      fontPreset: 'classic',
    });
  });

  it('writes no styles object at all when neither knob was sent', () => {
    const normalized = TenantService.normalizeFlatOverrides({
      title: 'A blog',
    });
    // An empty object would still merge and could shadow a stored section.
    expect(normalized.configuration.general.styles).toBeUndefined();
  });

  it('carries a single knob without inventing the other', () => {
    const normalized = TenantService.normalizeFlatOverrides({
      accent: '#0af',
    });
    expect(normalized.configuration.general.styles).toEqual({
      accent: '#0af',
    });
  });

  it('seeded config carries the signup appearance choices end to end', async () => {
    const config = await TenantService.buildConfig(
      'alice',
      { styleTemplate: 'developer', accent: '#89b4fa', fontPreset: 'technical' },
      'alice',
    );
    expect(config.configuration.general.styleTemplate).toBe('developer');
    expect(config.configuration.general.styles.accent).toBe('#89b4fa');
    expect(config.configuration.general.styles.fontPreset).toBe('technical');
    // The seed's own defaults survive alongside.
    expect(config.configuration.general.theme).toBe('system');
  });
});
