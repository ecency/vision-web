import {
  type DefaultError,
  type QueryClient,
  type UseMutationOptions,
  useMutation,
} from '@tanstack/react-query';
import {
  type ComponentType,
  memo,
  type PropsWithChildren,
  type ReactNode,
  useMemo,
  useSyncExternalStore,
} from 'react';

// Build-time config import (fallback)
import buildTimeConfig from '../../config.json';
import { mergeConfig } from './merge-config';

/**
 * The nested sections applyConfig and the feature hooks dereference. Values are
 * deliberately absent: every consumer already supplies its own default (?? or
 * ||), so the skeleton only has to guarantee the objects exist. Anything given a
 * value here would silently become that consumer's default instead.
 */
const CONFIG_SKELETON = {
  version: 1,
  configuration: {
    general: { styles: {} },
    instanceConfiguration: {
      meta: {},
      layout: { sidebar: {} },
      features: {},
    },
  },
} as const;

// =============================================================================
// Configuration Types
// =============================================================================

export interface InstanceConfig {
  version: number;
  configuration: {
    general: {
      theme: string;
      styleTemplate?: string;
      language: string;
      timezone: string;
      dateFormat: string;
      timeFormat: string;
      dateTimeFormat: string;
      imageProxy: string;
      profileBaseUrl: string;
      createPostUrl: string;
      styles: {
        background: string;
      };
    };
    instanceConfiguration: {
      type: 'blog' | 'community';
      username: string;
      owner?: string;
      /** Set by the managed-hosting API in served configs; absent on true self-hosting. */
      managed?: boolean;
      /**
       * Marks the shared default template served for an UNCLAIMED *.blogs.ecency.com subdomain
       * (no tenant row yet). The app shows the claim landing instead of a blog. Only present on the
       * managed default config, never on a real tenant or a true self-host.
       */
      template?: boolean;
      communityId: string;
      meta: {
        title: string;
        description: string;
        logo: string;
        favicon: string;
        keywords: string;
      };
      layout: {
        listType: 'list' | 'grid';
        search: {
          enabled: boolean;
        };
        sidebar: {
          placement: 'left' | 'right';
          followers: { enabled: boolean };
          following: { enabled: boolean };
          hiveInformation: { enabled: boolean };
        };
      };
      features: {
        postsFilters: string[];
        likes: { enabled: boolean };
        comments: { enabled: boolean };
        post: {
          text2Speech: { enabled: boolean };
        };
        tipping?: {
          enabled?: boolean;
          general?: { enabled: boolean; buttonLabel?: string };
          post?: { enabled: boolean; buttonLabel?: string };
          amounts?: number[];
        };
        auth: {
          enabled: boolean;
          methods: string[];
        };
      };
    };
  };
}

// =============================================================================
// Configuration Store (supports runtime updates)
// =============================================================================

type ConfigListener = () => void;

class ConfigStore {
  private config: InstanceConfig;
  private listeners: Set<ConfigListener> = new Set();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Start with build-time config
    this.config = buildTimeConfig as InstanceConfig;
  }

  /**
   * Initialize config - tries runtime fetch, falls back to build-time
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.loadRuntimeConfig();
    await this.initPromise;
    this.initialized = true;
  }

  /**
   * Try to load config from runtime /config.json endpoint
   */
  private async loadRuntimeConfig(): Promise<void> {
    try {
      // Only attempt runtime fetch in browser
      if (typeof window === 'undefined') return;

      const response = await fetch('/config.json', {
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.debug('[Config] Runtime config not found, using build-time config');
        return;
      }

      const runtimeConfig = await response.json();

      // Validate basic structure
      if (runtimeConfig?.version && runtimeConfig?.configuration) {
        // Merged over a structural skeleton, NOT over the build-time config.
        //
        // The merge exists so a served config that omits a nested section
        // cannot leave those paths undefined for the consumers that read them.
        // It must supply shape only. Merging the build-time config would supply
        // CONTENT: the image published without a baked config falls back to
        // config.template.json, a demo document, so an omitted meta.logo would
        // make the blog hotlink the template's placeholder URL, and an omitted
        // username would resolve the ownership gate in auth-provider
        // (owner || username) to the template's account.
        this.config = mergeConfig(
          CONFIG_SKELETON as InstanceConfig,
          runtimeConfig as InstanceConfig,
        );
        this.notifyListeners();
        console.debug('[Config] Loaded runtime config v' + runtimeConfig.version);
      }
    } catch (error) {
      // Silent fallback to build-time config
      console.debug('[Config] Using build-time config:', error instanceof Error ? error.message : 'fetch failed');
    }
  }

  /**
   * Get current config (synchronous)
   */
  getConfig(): InstanceConfig {
    return this.config;
  }

  /**
   * Get snapshot for useSyncExternalStore
   */
  getSnapshot = (): InstanceConfig => {
    return this.config;
  };

  /**
   * Subscribe to config changes
   */
  subscribe = (listener: ConfigListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Notify all listeners of config change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  /**
   * Update config at runtime (for config editor)
   */
  updateConfig(newConfig: InstanceConfig): void {
    this.config = newConfig;
    this.notifyListeners();
  }

  /**
   * Check if config has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
const configStore = new ConfigStore();

// =============================================================================
// Public API - InstanceConfigManager namespace
// =============================================================================

export namespace InstanceConfigManager {
  /**
   * Initialize configuration (call once at app startup)
   * Attempts to load runtime config, falls back to build-time config
   */
  export async function initialize(): Promise<void> {
    return configStore.initialize();
  }

  /**
   * Get the full config object (synchronous, returns current config)
   * This function returns the current config on each call to ensure
   * consumers always see runtime updates after initialize() is called.
   */
  export function getConfig(): InstanceConfig {
    return configStore.getConfig();
  }

  export type ConfigBasedCondition<T = boolean> = (config: InstanceConfig) => T;

  /**
   * Get a value from config using a selector function
   */
  export function getConfigValue<T>(condition: ConfigBasedCondition<T>): T {
    return condition(configStore.getConfig());
  }

  /**
   * Check a boolean condition against config
   */
  export function selector(condition: ConfigBasedCondition): boolean {
    return condition(configStore.getConfig());
  }

  /**
   * Execute callback if condition is true
   */
  export function withConditional<T>(
    condition: ConfigBasedCondition,
    callback: () => T,
  ): T | undefined {
    if (condition(configStore.getConfig())) {
      return callback();
    }
  }

  /**
   * React hook to subscribe to config changes
   */
  export function useConfig<T>(selector: ConfigBasedCondition<T>): T {
    const config = useSyncExternalStore(
      configStore.subscribe,
      configStore.getSnapshot,
      configStore.getSnapshot
    );
    return useMemo(() => selector(config), [config, selector]);
  }

  /**
   * React hook to get full config with reactivity
   */
  export function useFullConfig(): InstanceConfig {
    return useSyncExternalStore(
      configStore.subscribe,
      configStore.getSnapshot,
      configStore.getSnapshot
    );
  }

  /**
   * Compose multiple conditional results, filtering out undefined values
   */
  export function composeConditionals<T extends ReturnType<typeof withConditional>>(
    ...withConditionals: T[]
  ): NonNullable<T>[] {
    return withConditionals.filter((c) => !!c) as NonNullable<T>[];
  }

  /**
   * Return component if condition is true, otherwise return fallback
   */
  export function withConditionalComponent<F, CT>(
    condition: ConfigBasedCondition,
    component: ComponentType<CT>,
    fallback: () => F,
  ): ComponentType<CT> | F {
    if (condition(configStore.getConfig())) {
      return component;
    }
    return fallback();
  }

  /**
   * Conditional mutation hook that only executes if condition is true
   */
  export const useConditionalMutation = <
    TData = unknown,
    TError = DefaultError,
    TVariables = void,
    TContext = unknown,
  >(
    condition: ConfigBasedCondition,
    options: UseMutationOptions<TData, TError, TVariables, TContext>,
    queryClient?: QueryClient,
  ) =>
    useMutation(
      {
        ...options,
        mutationFn: (args, ctx) => {
          if (!options.mutationFn) {
            return Promise.reject(
              new Error('Conditional mutation called without mutationFn'),
            );
          }

          if (!condition(configStore.getConfig())) {
            return Promise.reject(
              new Error('Condition not met for conditional mutation'),
            );
          }

          return options.mutationFn(args, ctx);
        },
      },
      queryClient,
    );

  /**
   * Conditional rendering component
   */
  interface ConditionalProps extends PropsWithChildren {
    condition: ConfigBasedCondition;
    fallback?: ReactNode;
  }

  export const Conditional = memo<ConditionalProps>((props) => {
    const config = useSyncExternalStore(
      configStore.subscribe,
      configStore.getSnapshot,
      configStore.getSnapshot
    );

    if (props.condition(config)) {
      return props.children;
    }

    return props.fallback;
  });
  Conditional.displayName = 'ConditionalByConfig';

  /**
   * Update config at runtime (for config editor / floating menu)
   */
  export function updateConfig(newConfig: InstanceConfig): void {
    configStore.updateConfig(newConfig);
  }

  /**
   * Get raw config store for advanced use cases
   */
  export function getStore(): ConfigStore {
    return configStore;
  }
}
