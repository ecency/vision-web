import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyConfigDom,
  defaultPostsFiltersFor,
  endConfigPreview,
  type InstanceConfig,
  InstanceConfigManager,
  type InstanceType,
  previewConfigDraft,
  toInstanceType,
  withPinnedInstanceType,
} from '@/core';
import {
  clearHostingToken,
  getHostingToken,
  HOSTING_FETCH_TIMEOUT_MS,
} from '@/features/auth/utils/hosting-token';
import { buildConfigFields, editedStyleTemplate, pickFields } from '../config-fields';
import { getCurrentLanguage, t } from '@/core/i18n';
import { FLOATING_MENU_THEME } from '../constants';
import { getHivesignerSetupNotice } from '../hivesigner-setup';
import {
  readDiscarded,
  readSavedConfig,
  withServedOnlyMarkers,
} from '../save-response';
import type { ConfigValue } from '../types';
import { downloadJson, updateNestedPath } from '../utils';
import { ConfigEditor } from './config-editor';
import { TemplateCards } from './template-cards';

const HOSTING_API_URL = 'https://api.blogs.ecency.com/hosting';

function isManagedHosting(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.hostname.endsWith('.blogs.ecency.com')) return true;
  // Verified custom domains serve a config with the managed flag injected by the hosting
  // API; a truly self-hosted config never carries it. Read from the baseline:
  // a drafted document under preview must not change which server contract
  // applies.
  return (
    InstanceConfigManager.getBaseConfigValue(
      ({ configuration }) => configuration.instanceConfiguration.managed,
    ) === true
  );
}

function getTenantUsername(): string | null {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname;
  const match = hostname.match(/^([a-z0-9-]+)\.blogs\.ecency\.com$/);
  if (match) return match[1];
  if (!isManagedHosting()) return null;
  // Custom domain: the tenant name comes from the served config instead of the
  // hostname. Baseline read: the save must target the real tenant even if the
  // draft edited the username field.
  return (
    InstanceConfigManager.getBaseConfigValue(
      ({ configuration }) => configuration.instanceConfiguration.username,
    ) || null
  );
}

const INSTANCE_TYPE_PATH = 'configuration.instanceConfiguration.type';
const POSTS_FILTERS_PATH =
  'configuration.instanceConfiguration.features.postsFilters';

/**
 * The instance type the hosting API will keep no matter what this document
 * says: applyConfigDocument pins it from the stored config. Null when the site
 * is not on managed hosting, where the edited document is what the owner
 * deploys.
 */
function getPinnedInstanceType(): InstanceType | null {
  if (!isManagedHosting()) return null;
  return toInstanceType(
    InstanceConfigManager.getBaseConfigValue(
      ({ configuration }) => configuration.instanceConfiguration.type,
    ),
  );
}

/**
 * The panel restructured around how owners actually customize: the choices
 * that change how a site looks come first, identity and features follow, and
 * the FULL schema stays reachable under Advanced, so nothing becomes
 * config-file-only. Each tab is a pickFields curation over the one schema.
 */
type EditorTab = 'appearance' | 'identity' | 'features' | 'advanced';

const EDITOR_TABS: Array<{ id: EditorTab; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'identity', label: 'Identity' },
  { id: 'features', label: 'Features' },
  { id: 'advanced', label: 'Advanced' },
];

const TAB_FIELD_PATHS: Record<Exclude<EditorTab, 'advanced'>, readonly string[]> = {
  // The template itself renders as cards above this subset.
  appearance: [
    'configuration.general.theme',
    'configuration.general.styles',
    'configuration.instanceConfiguration.layout',
  ],
  identity: [
    'configuration.instanceConfiguration.meta',
    'configuration.general.language',
  ],
  features: ['configuration.instanceConfiguration.features'],
};

interface FloatingMenuWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FloatingMenuWindow({
  isOpen,
  onClose,
}: FloatingMenuWindowProps) {
  const [config, setConfig] = useState<Record<string, ConfigValue>>(() => {
    return InstanceConfigManager.getConfig() as unknown as Record<
      string,
      ConfigValue
    >;
  });
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>('appearance');
  // What the site currently stores: the dirty indicator and Revert compare
  // and restore against this, and a successful save moves it forward.
  const [savedBaseline, setSavedBaseline] = useState<Record<string, ConfigValue>>(
    () =>
      InstanceConfigManager.getConfig() as unknown as Record<string, ConfigValue>,
  );
  const [isSaving, setIsSaving] = useState(false);
  // HiveAuth sends the signing request to a phone, so the owner has to be told
  // to go and look at it. Every other method prompts on this screen.
  const [awaitingWallet, setAwaitingWallet] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle',
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const managed = useMemo(() => isManagedHosting(), []);

  /*
   * Built here rather than imported as a constant, because the labels come from
   * `t()` and that reads the language out of the loaded config. Keyed on the
   * language so a saved language change is picked up: the panel edits a local
   * copy of the document, and `t()` reads the APPLIED one, so the two only
   * agree again after a save.
   */
  const language = getCurrentLanguage();
  const configFields = useMemo(() => buildConfigFields(t), [language]);
  const tabFields = useMemo(
    () => ({
      appearance: pickFields(configFields, TAB_FIELD_PATHS.appearance),
      identity: pickFields(configFields, TAB_FIELD_PATHS.identity),
      features: pickFields(configFields, TAB_FIELD_PATHS.features),
    }),
    [configFields],
  );

  // Experimenting must feel safe: the header says when the document differs
  // from what the site stores, and Revert takes it back in one step.
  const isDirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(savedBaseline),
    [config, savedBaseline],
  );

  // Everything the owner is being told, in one place. This window is the whole
  // audience: it is rendered for the instance owner only, so a setting that
  // cannot work can be reported here without a reader ever seeing it. Read from
  // the edited document, so it answers for what is on screen and clears as soon
  // as the client id is typed.
  const notices = useMemo(
    () =>
      [notice, getHivesignerSetupNotice(config)].filter(
        (message): message is string => !!message,
      ),
    [notice, config],
  );

  // Focus the dialog when it opens for keyboard accessibility
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen]);

  const handleUpdate = useCallback((path: string, value: ConfigValue) => {
    const isTypeChange = path === INSTANCE_TYPE_PATH;

    if (isTypeChange) {
      // The hosting API pins the instance type from the stored config, so a
      // switch made here is never persisted while the filters auto-filled
      // beside it are. That combination is what leaves a blog instance whose
      // only filters are community sorts, and every feed tab then errors.
      const pinnedType = getPinnedInstanceType();
      if (pinnedType && value !== pinnedType) {
        setNotice(
          'Instance type is set when the site is created and cannot be changed from the editor.',
        );
        return;
      }
    }
    setNotice(null);

    setConfig((prev) => {
      const updated = updateNestedPath(prev, path, value);

      // Auto-fill postsFilters when instance type changes. Only sorts the new
      // type can actually fetch: a blog feed calls bridge.get_account_posts, a
      // community feed calls bridge.get_ranked_posts.
      if (isTypeChange) {
        return updateNestedPath(
          updated,
          POSTS_FILTERS_PATH,
          defaultPostsFiltersFor(toInstanceType(value)),
        );
      }

      return updated;
    });
  }, []);

  const handleDownload = useCallback(() => {
    downloadJson(config, 'config.json');
  }, [config]);

  const handleRevert = useCallback(() => {
    setConfig(savedBaseline);
    setNotice(null);
    // The preview effect re-previews the reverted document by itself.
  }, [savedBaseline]);

  const handleSave = useCallback(async () => {
    const username = getTenantUsername();
    if (!username) {
      setSaveStatus('error');
      setSaveError('This site is not on managed hosting.');
      return;
    }

    setIsSaving(true);
    setAwaitingWallet(false);
    setSaveStatus('idle');
    setSaveError(null);
    // Last line of defence for a document that already carries filters from
    // before this was fixed, or one edited outside the editor and pasted back:
    // what goes out must agree with the type the server keeps.
    const pinnedType = getPinnedInstanceType();
    const outgoing = pinnedType
      ? withPinnedInstanceType(config, pinnedType)
      : config;
    try {
      const saveWith = (token: string) =>
        fetch(`${HOSTING_API_URL}/v1/tenants/${encodeURIComponent(username)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ config: outgoing }),
          signal: AbortSignal.timeout(HOSTING_FETCH_TIMEOUT_MS),
        });

      const tokenCallbacks = { onWalletWaiting: () => setAwaitingWallet(true) };

      let response = await saveWith(
        await getHostingToken(HOSTING_API_URL, tokenCallbacks),
      );
      if (response.status === 401) {
        // Cached hosting token no longer accepted; get a fresh one and retry once.
        clearHostingToken();
        response = await saveWith(
          await getHostingToken(HOSTING_API_URL, tokenCallbacks),
        );
      }

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Only the site owner can save the configuration.');
        }
        const data = await response.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ||
            `Save failed (${response.status})`,
        );
      }
      // A save becomes the new baseline. updateConfig also drops any active
      // preview overlay, so exiting preview later lands on the document that
      // was just stored instead of rolling it back; while preview mode stays
      // on, the config-change effect below re-previews the saved draft, which
      // is now identical to the baseline.
      const payload = await response.json().catch(() => null);
      const saved = readSavedConfig(payload);
      const managed = InstanceConfigManager.getBaseConfigValue(
        ({ configuration }) => configuration.instanceConfiguration.managed,
      );
      const baseline = saved ? withServedOnlyMarkers(saved, managed) : outgoing;
      setConfig(baseline);
      setSavedBaseline(baseline);
      InstanceConfigManager.updateConfig(baseline as unknown as InstanceConfig);
      applyConfigDom(baseline, { syncSystemTheme: true });

      const discarded = readDiscarded(payload);
      setNotice(
        discarded.length > 0
          ? `Saved, but the server did not store: ${discarded.join(', ')}. The editor now shows what was stored.`
          : null,
      );

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      setSaveStatus('error');
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveError(null);
      }, 8000);
    } finally {
      setIsSaving(false);
      // Cleared here rather than on success: a rejected or expired HiveAuth
      // request also ends the wait, and leaving this set would strand the
      // button on "Approve on your phone" with nothing pending.
      setAwaitingWallet(false);
    }
  }, [config]);

  const handleTogglePreview = useCallback(() => {
    // Preview runs through the config store, so components re-render with the
    // draft, plus applyConfigDom for what no component renders. Exiting drops
    // the overlay and re-applies the baseline; there is no snapshot to manage.
    if (!isPreviewMode) {
      previewConfigDraft(config);
    } else {
      endConfigPreview();
    }
    setIsPreviewMode(!isPreviewMode);
  }, [isPreviewMode, config]);

  // End preview when the window unmounts mid-preview. endConfigPreview is
  // idempotent, so the exit button having already run it is fine.
  useEffect(() => {
    if (!isPreviewMode) {
      return;
    }
    return () => {
      endConfigPreview();
    };
  }, [isPreviewMode]);

  // Re-preview when the draft changes while in preview mode
  useEffect(() => {
    if (isPreviewMode) {
      previewConfigDraft(config);
    }
  }, [config, isPreviewMode]);

  const handleExitPreview = useCallback(() => {
    endConfigPreview();
    setIsPreviewMode(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  const windowClassName = useMemo(
    () =>
      `absolute bottom-0 left-0 right-0 shadow-2xl transition-all duration-300 ease-in-out pointer-events-auto overflow-hidden ${
        isOpen ? 'h-[80vh] rounded-t-2xl' : 'h-0'
      }`,
    [isOpen],
  );

  // Preview indicator component (shown regardless of menu state)
  const previewIndicator = isPreviewMode && (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
      <button
        type="button"
        onClick={handleExitPreview}
        className="flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-sm font-sans font-medium text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer group"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        }}
        aria-label="Exit preview mode"
      >
        <span
          className="size-2 rounded-full bg-emerald-400 animate-pulse"
          aria-hidden="true"
        />
        <span>Preview Mode</span>
        <svg
          className="size-4 opacity-60 group-hover:opacity-100 transition-opacity"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );

  if (!isOpen) {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        {previewIndicator}
        <div
          className={windowClassName}
          style={{
            maxHeight: '80vh',
            backgroundColor: FLOATING_MENU_THEME.background,
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-40 pointer-events-none"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="config-editor-title"
    >
      {previewIndicator}

      <div
        className={windowClassName}
        style={{
          maxHeight: '80vh',
          backgroundColor: FLOATING_MENU_THEME.background,
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <header
            className="flex items-center justify-between p-4 shrink-0 rounded-t-lg border-b"
            style={{
              borderColor: FLOATING_MENU_THEME.borderColor,
            }}
          >
            <h2
              id="config-editor-title"
              className="text-sm font-semibold font-sans text-white"
            >
              Configuration Editor
            </h2>
            <div className="flex items-center gap-2">
              {isDirty && (
                <>
                  <span
                    className="text-xs font-sans text-amber-400 flex items-center gap-1.5"
                    role="status"
                  >
                    <span
                      className="size-1.5 rounded-full bg-amber-400"
                      aria-hidden="true"
                    />
                    Unsaved changes
                  </span>
                  <button
                    onClick={handleRevert}
                    className="text-sm font-sans px-3 py-1.5 text-gray-300 hover:text-gray-100 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{
                      backgroundColor: FLOATING_MENU_THEME.buttonBackground,
                    }}
                    type="button"
                    aria-label="Revert unsaved changes"
                  >
                    Revert
                  </button>
                </>
              )}
              <button
                onClick={handleTogglePreview}
                className={`text-sm font-sans px-3 py-1.5 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-1.5 ${
                  isPreviewMode
                    ? 'text-emerald-400 hover:text-emerald-300'
                    : 'text-gray-300 hover:text-gray-100'
                }`}
                style={{
                  backgroundColor: isPreviewMode
                    ? 'rgba(16, 185, 129, 0.2)'
                    : FLOATING_MENU_THEME.buttonBackground,
                }}
                type="button"
                aria-label={
                  isPreviewMode ? 'Exit preview mode' : 'Preview configuration'
                }
                aria-pressed={isPreviewMode}
              >
                <svg
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                {isPreviewMode ? 'Exit Preview' : 'Preview'}
              </button>
              {managed ? (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`text-sm font-sans px-3 py-1.5 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    saveStatus === 'success'
                      ? 'text-emerald-400'
                      : saveStatus === 'error'
                        ? 'text-red-400'
                        : 'text-gray-300 hover:text-gray-100'
                  }`}
                  style={{
                    backgroundColor: FLOATING_MENU_THEME.buttonBackground,
                  }}
                  type="button"
                  aria-label="Save configuration"
                >
                  {isSaving
                    ? awaitingWallet
                      ? 'Approve on your phone'
                      : 'Saving...'
                    : saveStatus === 'success'
                      ? 'Saved!'
                      : saveStatus === 'error'
                        ? 'Failed'
                        : 'Save'}
                </button>
              ) : (
                <button
                  onClick={handleDownload}
                  className="text-sm font-sans px-3 py-1.5 text-gray-300 hover:text-gray-100 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    backgroundColor: FLOATING_MENU_THEME.buttonBackground,
                  }}
                  type="button"
                  aria-label="Download configuration"
                >
                  Download
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-1"
                aria-label="Close editor"
                type="button"
              >
                <svg
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </header>

          {/* Save error detail */}
          {saveError && (
            <div
              className="px-4 py-2 text-sm font-sans text-red-400 border-b shrink-0"
              style={{ borderColor: FLOATING_MENU_THEME.borderColor }}
              role="alert"
            >
              {saveError}
            </div>
          )}

          {/* Owner-only: a field the server owns, or a setting that cannot work as configured */}
          {notices.length > 0 && (
            <output
              className="block px-4 py-2 text-sm font-sans text-gray-300 border-b shrink-0 space-y-1"
              style={{ borderColor: FLOATING_MENU_THEME.borderColor }}
            >
              {notices.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </output>
          )}

          {/* Task-oriented tabs: Appearance first, the full schema under
              Advanced. Progressive disclosure over one flat scroll. */}
          <nav
            className="flex gap-1 px-4 pt-2 shrink-0 border-b"
            style={{ borderColor: FLOATING_MENU_THEME.borderColor }}
            aria-label="Configuration sections"
          >
            {EDITOR_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`text-sm font-sans px-3 py-2 rounded-t border-b-2 -mb-px transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  activeTab === tab.id
                    ? 'text-white border-blue-500'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <main className="flex-1 overflow-y-auto p-6 min-h-0">
            <div className="container mx-auto max-w-7xl">
              {activeTab === 'appearance' && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold mb-3 text-white font-sans">
                    Style template
                  </h3>
                  <TemplateCards
                    value={editedStyleTemplate(config)}
                    onPick={(id) =>
                      handleUpdate('configuration.general.styleTemplate', id)
                    }
                  />
                </div>
              )}
              <ConfigEditor
                config={config}
                fields={
                  activeTab === 'advanced' ? configFields : tabFields[activeTab]
                }
                onUpdate={handleUpdate}
              />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
