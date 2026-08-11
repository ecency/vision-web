/**
 * The Configuration Editor's preview, as one lifecycle over two surfaces.
 *
 * A draft config renders through the same two paths a real config does: the
 * store, so React subscribers re-render with the draft, and applyConfigDom,
 * which owns the <html> attributes and custom properties no component renders.
 * Ending preview drops the overlay and re-applies the baseline through the
 * same declaration, so there is no snapshot to drift from what boot produces:
 * restore IS a fresh apply of the running config.
 *
 * applyConfigDom runs WITH syncSystemTheme in both directions, keyed to the
 * document being applied: a draft with a fixed theme removes the baseline's
 * OS listener for the duration of the preview, so an OS flip cannot overwrite
 * what the owner is looking at, and a draft with `theme: system` follows the
 * OS while previewed. Ending preview re-synchronizes to the baseline. The
 * listener is a single idempotent module slot (remove then add), so applying
 * on every draft change cannot accumulate listeners.
 */

import { applyConfigDom } from './apply-config-dom';
import {
  type InstanceConfig,
  InstanceConfigManager,
} from './configuration-loader';

/** Begin preview, or update the active one with a newer draft. */
export function previewConfigDraft(draft: unknown): void {
  InstanceConfigManager.setPreviewConfig(draft as InstanceConfig);
  applyConfigDom(draft, { syncSystemTheme: true });
}

/**
 * End preview and land back on the baseline. Idempotent: ending twice (the
 * exit button, then the unmount cleanup) re-applies the baseline twice, which
 * produces the same document both times.
 */
export function endConfigPreview(): void {
  InstanceConfigManager.clearPreviewConfig();
  applyConfigDom(InstanceConfigManager.getBaseConfig(), {
    syncSystemTheme: true,
  });
}
