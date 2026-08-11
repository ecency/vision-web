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
 * applyConfigDom runs without syncSystemTheme in both directions. The listener
 * the boot path registered stays in place and keeps answering for the baseline
 * theme, and a keystroke in the editor cannot register listeners.
 */

import { applyConfigDom } from './apply-config-dom';
import {
  type InstanceConfig,
  InstanceConfigManager,
} from './configuration-loader';

/** Begin preview, or update the active one with a newer draft. */
export function previewConfigDraft(draft: unknown): void {
  InstanceConfigManager.setPreviewConfig(draft as InstanceConfig);
  applyConfigDom(draft);
}

/**
 * End preview and land back on the baseline. Idempotent: ending twice (the
 * exit button, then the unmount cleanup) re-applies the baseline twice, which
 * produces the same document both times.
 */
export function endConfigPreview(): void {
  InstanceConfigManager.clearPreviewConfig();
  applyConfigDom(InstanceConfigManager.getBaseConfig());
}
