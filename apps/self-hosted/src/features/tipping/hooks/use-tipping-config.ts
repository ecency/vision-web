import { InstanceConfigManager } from '@/core';
import { useMemo } from 'react';
import type { TippingVariant } from '../types';

const DEFAULT_PRESETS = [1, 5, 10];
const DEFAULT_BUTTON_LABEL = 'Tip';

export function useTippingConfig(variant: TippingVariant) {
  // Reactive: the Configuration Editor's preview serves a draft through the
  // store, and drafted tipping labels must leave with the preview.
  const config = InstanceConfigManager.useFullConfig();
  return useMemo(() => {
    const tipping = config.configuration.instanceConfiguration.features?.tipping;
    if (!tipping) {
      return { enabled: false, buttonLabel: DEFAULT_BUTTON_LABEL, presetAmounts: DEFAULT_PRESETS };
    }
    const sub = variant === 'post' ? tipping.post : tipping.general;
    const enabled = Boolean(sub?.enabled);
    const buttonLabel = sub?.buttonLabel ?? DEFAULT_BUTTON_LABEL;
    const presetAmounts = Array.isArray(tipping.amounts) && tipping.amounts.length > 0
      ? tipping.amounts
      : DEFAULT_PRESETS;
    return { enabled, buttonLabel, presetAmounts };
  }, [config, variant]);
}
