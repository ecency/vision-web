// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyConfigDom, InstanceConfigManager } from '@/core';
import type { InstanceConfig } from '@/core';
import {
  buildClaimPreviewConfig,
  enterClaimPreview,
  isClaimPreviewActive,
  isClaimPreviewRequested,
} from './claim-preview';

/** The shared unclaimed-host document, as nginx serves it (template: true). */
const TEMPLATE_CONFIG = {
  version: 1,
  configuration: {
    general: { theme: 'system', language: 'en', styles: {} },
    instanceConfiguration: {
      type: 'blog',
      username: 'ecency',
      template: true,
      communityId: '',
      meta: { title: 'Demo', description: '', logo: '', favicon: '', keywords: '' },
      layout: { listType: 'list', search: { enabled: true }, sidebar: { placement: 'right', followers: { enabled: true }, following: { enabled: true }, hiveInformation: { enabled: true } } },
      features: { postsFilters: ['posts'], likes: { enabled: true }, comments: { enabled: true }, post: { text2Speech: { enabled: false } }, auth: { enabled: true, methods: ['keychain'] } },
    },
  },
} as unknown as InstanceConfig;

describe('claim preview', () => {
  beforeEach(() => {
    InstanceConfigManager.updateConfig(structuredClone(TEMPLATE_CONFIG) as InstanceConfig);
    applyConfigDom(InstanceConfigManager.getConfig());
  });

  it('builds a read-only blog config: auth off, blog filters, marker set', () => {
    const config = buildClaimPreviewConfig('alice.dev', false);
    const instance = config.configuration.instanceConfiguration;
    expect(instance.username).toBe('alice.dev');
    expect(instance.type).toBe('blog');
    expect(instance.features.auth.enabled).toBe(false);
    expect(instance.features.auth.methods).toEqual([]);
    expect(instance.features.postsFilters).toEqual(['posts', 'blog']);
    expect(isClaimPreviewActive(config)).toBe(true);
    // The gate flag must be ABSENT, not false: the root component checks === true,
    // and a stray template key would keep the CTA on screen.
    expect('template' in instance).toBe(false);
  });

  it('builds a community config with community filters and id', () => {
    const config = buildClaimPreviewConfig('hive-125125', true);
    const instance = config.configuration.instanceConfiguration;
    expect(instance.type).toBe('community');
    expect(instance.communityId).toBe('hive-125125');
    expect(instance.features.postsFilters).toEqual(['trending', 'hot', 'created']);
  });

  it('entering preview flips the template gate and paints the DOM', () => {
    expect(
      InstanceConfigManager.getConfigValue(
        ({ configuration }) => configuration.instanceConfiguration.template === true,
      ),
    ).toBe(true);

    enterClaimPreview('alice', false);

    expect(
      InstanceConfigManager.getConfigValue(
        ({ configuration }) => configuration.instanceConfiguration.template === true,
      ),
    ).toBe(false);
    expect(isClaimPreviewActive(InstanceConfigManager.getConfig())).toBe(true);
    expect(document.documentElement.getAttribute('data-instance-type')).toBe('blog');
    expect(document.documentElement.getAttribute('data-style-template')).toBe('medium');
  });

  it('recognizes the boot param strictly', () => {
    expect(isClaimPreviewRequested('?preview=1')).toBe(true);
    expect(isClaimPreviewRequested('?preview=0')).toBe(false);
    expect(isClaimPreviewRequested('?preview=yes')).toBe(false);
    expect(isClaimPreviewRequested('')).toBe(false);
  });

  it('a real tenant config never reads as a claim preview', () => {
    const real = structuredClone(TEMPLATE_CONFIG) as InstanceConfig;
    delete (real.configuration.instanceConfiguration as { template?: boolean }).template;
    expect(isClaimPreviewActive(real)).toBe(false);
  });
});
