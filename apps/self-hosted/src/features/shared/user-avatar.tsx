'use client';

import { UserAvatar as BaseUserAvatar, type UserAvatarProps as BaseUserAvatarProps } from '@ecency/ui';
import { InstanceConfigManager } from '@/core';

export type UserAvatarProps = Omit<BaseUserAvatarProps, 'imageProxyBase'>;

/**
 * UserAvatar wrapper that automatically uses the configured image proxy.
 * Re-exports @ecency/ui UserAvatar with imageProxyBase pre-filled from config.
 */
export function UserAvatar(props: UserAvatarProps) {
  const imageProxyBase = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.general.imageProxy || 'https://i.ecency.com',
  );

  return <BaseUserAvatar {...props} imageProxyBase={imageProxyBase} />;
}
