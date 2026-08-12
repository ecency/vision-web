import type { PropsWithChildren } from 'react';
import { useThemeComponents } from '@/themes/use-theme-components';

/**
 * The page shell, resolved through the theme registry. Every CSS-only
 * template resolves to DefaultShell and renders exactly what this component
 * used to hardcode; a layout-level theme overrides the Shell seam in its
 * manifest and owns the frame.
 */
export function BlogLayout(props: PropsWithChildren) {
  const { Shell } = useThemeComponents();
  return <Shell>{props.children}</Shell>;
}
