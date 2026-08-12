// Imported from the module rather than the `@/core` barrel on purpose: the
// barrel pulls `configuration-loader`, which imports the build-time
// `config.json`. That file is gitignored and absent in CI, so the barrel would
// make this module, and every test that reads it, unloadable there.
import {
  HIVE_LAYER_CONFIG_DEFAULTS,
  PAYOUT_LABEL_MAX_LENGTH,
  resolveLearnMoreUrl,
} from '@/core/hive-layer';
import { isCommunityConfig } from '@/core/instance-mode';
import { FONT_PRESET_OPTIONS } from '@/core/theme-appearance';
import type { ConfigValue } from './types';
import type { TranslationKey } from '@/core/i18n-strings';
import { AUTH_METHODS } from '@/features/auth/utils/auth-methods';
import { isRefusedCreatePostUrl } from '@/features/auth/utils/create-post-target';
import {
  STYLE_TEMPLATES,
  type StyleTemplate,
} from '../../../hosting/api/src/style-templates';
import { isThemeOptionSupported } from '@/themes/registry';

/**
 * The configured style template out of the EDITED document, for visibleWhen
 * predicates: visibility must follow the unsaved draft, so switching the
 * template in the panel immediately shows or hides the options that theme
 * consumes.
 */
export function editedStyleTemplate(document: Record<string, ConfigValue>): unknown {
  const configuration = document?.configuration as
    | { general?: { styleTemplate?: unknown } }
    | undefined;
  return configuration?.general?.styleTemplate;
}

/**
 * One label key per roster entry, `satisfies` so adding a template to the
 * roster fails typecheck here until its label exists. This is the editor's
 * half of the single-source contract; the CSS half is guarded by
 * src/styles/style-template-roster.test.ts.
 */
const STYLE_TEMPLATE_LABEL_KEYS = {
  medium: 'panel_configuration_general_style_template_medium_option',
  minimal: 'panel_configuration_general_style_template_minimal_option',
  magazine: 'panel_configuration_general_style_template_magazine_option',
  developer: 'panel_configuration_general_style_template_developer_option',
  'modern-gradient':
    'panel_configuration_general_style_template_modern_gradient_option',
  journal: 'panel_configuration_general_style_template_journal_option',
  reader: 'panel_configuration_general_style_template_reader_option',
} satisfies Record<StyleTemplate, TranslationKey>;

export type ConfigFieldType =
  | 'string'
  // A hex colour: a native swatch beside a text input. The swatch alone cannot
  // express "unset", which is the value every instance holds today and the one
  // an owner has to be able to get back to.
  | 'color'
  /*
   * No `number`.
   *
   * The number input writes `null` when cleared, and `null` erases the stored
   * section on merge. Every section below already carries a comment saying so,
   * which is a convention held by memory; the type not existing makes it
   * unreachable instead.
   *
   * The one field that used it was `version`, and that was the worst possible
   * place for it: `configuration-loader` applies a served config only when
   * `runtimeConfig?.version` is truthy, so an owner who cleared that box
   * shipped `version: null` and every visitor's browser then discarded the
   * whole document and rendered the bare skeleton. No title, no logo, no theme.
   * A schema version is not an owner setting, so it has no control at all now;
   * the value still rides along in the document, which is saved whole.
   */
  | 'boolean'
  | 'array'
  | 'section'
  | 'select';

export interface ConfigField {
  label: string;
  type: ConfigFieldType;
  description?: string;
  fields?: Record<string, ConfigField>;
  options?: Array<{ value: string; label: string }>;
  /**
   * For `array` fields: the only entries this list accepts. Anything else is
   * rejected in the editor instead of being saved into a config that no code
   * reads. Entries stay primitives, since the hosting API drops an array
   * holding objects and reports the save as successful anyway.
   */
  allowedValues?: readonly string[];
  /**
   * What the panel shows when the config carries no value at this path, which
   * is every config written before the field existed.
   *
   * It must be the value the app resolves for an absent key, or the panel
   * displays a state the site disagrees with. Displaying it writes nothing: a
   * value reaches the document only through the field's `onChange`.
   */
  default?: string | boolean;
  /**
   * For `string` fields: the cap on the input, matching wherever the value is
   * cut at render. The wire limit is the whole document, so this is about a
   * sane control rather than storage.
   */
  maxLength?: number;
  /**
   * For `select` fields whose resolver accepts a value that is not spelled
   * exactly like the option, so the panel can show what the site is actually
   * doing.
   *
   * Opt-in, never the default. `resolveFontPreset` trims and lower-cases;
   * `oneOf` in core/hive-layer matches with a bare `includes`. Applying either
   * rule to the other's fields would make the panel disagree with the site.
   */
  normalizesCase?: boolean;
  /**
   * A message for a value the app will not use, or null when there is nothing
   * to say. `string` fields only; `color` has its own surface.
   *
   * Every rule here is BORROWED from the resolver that reads the field, never
   * restated. A panel that forms its own opinion about the same string is how
   * the panel and the site come to disagree, and the config editor has no way
   * to know it has done so: the save succeeds either way and the site quietly
   * keeps its old behaviour.
   *
   * Only fields whose resolver already refuses a value have one. Inventing a
   * rule the app does not enforce would reject input the site would have
   * accepted.
   *
   * `config` is the WHOLE document, not the section this field sits in, because
   * some rules are about combinations rather than single values: an external
   * composer is ignored outright on a community instance, and the instance type
   * lives in a different branch of the tree.
   */
  validate?: (
    value: string,
    config?: Record<string, ConfigValue>,
  ) => string | null;
  /**
   * For `color` fields: a short curated row of one-click swatches rendered
   * above the free hex input, so picking a look does not read like filling a
   * form. Presentation only; the stored value is whatever the row writes.
   */
  quickPicks?: readonly string[];
  /**
   * Render this field or section only while the predicate holds against the
   * WHOLE document, for choices that only exist under certain conditions
   * (a theme manifest's own options are the intended consumer: "choices
   * depend on the theme"). Visibility is presentation, never data: a hidden
   * field's stored value is untouched, exactly as if the panel had not been
   * opened. Absent means always visible.
   */
  visibleWhen?: (document: Record<string, ConfigValue>) => boolean;
}

/**
 * The renderer's visibility gate, separated so it can be tested without
 * rendering: a field with no predicate is always visible, and a predicate
 * that throws hides nothing (a broken predicate must not make a control
 * unreachable, which is the panel's own lockout class of bug).
 */
export function isFieldVisible(
  field: ConfigField,
  document: Record<string, ConfigValue>,
): boolean {
  if (!field.visibleWhen) return true;
  try {
    return field.visibleWhen(document);
  } catch {
    return true;
  }
}

/**
 * Built on call, not held as a constant.
 *
 * It was a module-level constant, and that is why every label here was
 * hardcoded English: the module is evaluated when the bundle loads, which is
 * before `InstanceConfigManager.initialize()` resolves, so a `t()` at that
 * point would have captured whatever language the bundle started with and
 * frozen it.
 *
 * `index.tsx` awaits that initialize before `createRoot().render()`, so by the
 * time anything calls this the config, and therefore the language, is loaded.
 *
 * The translator is passed in rather than imported. `t` reads the running
 * config, so importing it here would pull `configuration-loader` and its
 * build-time `config.json`, which is gitignored and absent in CI: this module
 * and every test that reads it would stop loading there. The same reason the
 * header comment gives for avoiding the `@/core` barrel.
 */
/** Looks a key up in the current language. `t` from `@/core/i18n` in the app. */
export type Translate = (key: TranslationKey) => string;

export function buildConfigFields(
  t: Translate,
): Record<string, ConfigField> {
  return {
  configuration: {
    label: t('panel_configuration_label'),
    type: 'section',
    fields: {
      instanceConfiguration: {
        label: t('panel_configuration_instance_configuration_label'),
        type: 'section',
        fields: {
          type: {
            label: t('panel_configuration_instance_configuration_type_label'),
            type: 'select',
            description: t('panel_configuration_instance_configuration_type_description'),
            options: [
              { value: 'blog', label: t('panel_configuration_instance_configuration_type_blog_option') },
              { value: 'community', label: t('panel_configuration_instance_configuration_type_community_option') },
            ],
          },
          username: {
            label: t('panel_configuration_instance_configuration_username_label'),
            type: 'string',
            description: t('panel_configuration_instance_configuration_username_description'),
          },
          communityId: {
            label: t('panel_configuration_instance_configuration_community_id_label'),
            type: 'string',
            description: t('panel_configuration_instance_configuration_community_id_description'),
          },
          meta: {
            label: t('panel_configuration_instance_configuration_meta_label'),
            type: 'section',
            fields: {
              title: {
                label: t('panel_configuration_instance_configuration_meta_title_label'),
                type: 'string',
                description: t('panel_configuration_instance_configuration_meta_title_description'),
              },
              description: {
                label: t('panel_configuration_instance_configuration_meta_description_label'),
                type: 'string',
                description: t('panel_configuration_instance_configuration_meta_description_description'),
              },
              logo: {
                label: t('panel_configuration_instance_configuration_meta_logo_label'),
                type: 'string',
                description: t('panel_configuration_instance_configuration_meta_logo_description'),
              },
              favicon: {
                label: t('panel_configuration_instance_configuration_meta_favicon_label'),
                type: 'string',
                description: t('panel_configuration_instance_configuration_meta_favicon_description'),
              },
              keywords: {
                label: t('panel_configuration_instance_configuration_meta_keywords_label'),
                type: 'string',
                description: t('panel_configuration_instance_configuration_meta_keywords_description'),
              },
            },
          },
          layout: {
            label: t('panel_configuration_instance_configuration_layout_label'),
            type: 'section',
            fields: {
              listType: {
                label: t('panel_configuration_instance_configuration_layout_list_type_label'),
                type: 'select',
                // Declared unsupported by themes whose entry component is not
                // list/grid switchable (Journal renders one column of plain
                // entries). Hidden, not inert: the stored value is untouched.
                visibleWhen: (document) =>
                  isThemeOptionSupported(editedStyleTemplate(document), 'listType'),
                description: t('panel_configuration_instance_configuration_layout_list_type_description'),
                options: [
                  { value: 'list', label: t('panel_configuration_instance_configuration_layout_list_type_list_option') },
                  { value: 'grid', label: t('panel_configuration_instance_configuration_layout_list_type_grid_option') },
                ],
              },
              search: {
                label: t('panel_configuration_instance_configuration_layout_search_label'),
                type: 'section',
                fields: {
                  enabled: {
                    label: t('panel_configuration_instance_configuration_layout_search_enabled_label'),
                    type: 'boolean',
                    description: t('panel_configuration_instance_configuration_layout_search_enabled_description'),
                  },
                },
              },
              sidebar: {
                label: t('panel_configuration_instance_configuration_layout_sidebar_label'),
                type: 'section',
                // Themes whose shell renders no sidebar declare it unsupported;
                // the whole section hides rather than sitting there doing nothing.
                visibleWhen: (document) =>
                  isThemeOptionSupported(editedStyleTemplate(document), 'sidebar'),
                fields: {
                  placement: {
                    label: t('panel_configuration_instance_configuration_layout_sidebar_placement_label'),
                    type: 'select',
                    description: t('panel_configuration_instance_configuration_layout_sidebar_placement_description'),
                    options: [
                      { value: 'left', label: t('panel_configuration_instance_configuration_layout_sidebar_placement_left_option') },
                      { value: 'right', label: t('panel_configuration_instance_configuration_layout_sidebar_placement_right_option') },
                    ],
                  },
                  followers: {
                    label: t('panel_configuration_instance_configuration_layout_sidebar_followers_label'),
                    type: 'section',
                    fields: {
                      enabled: {
                        label: t('panel_configuration_instance_configuration_layout_sidebar_followers_enabled_label'),
                        type: 'boolean',
                        description: t('panel_configuration_instance_configuration_layout_sidebar_followers_enabled_description'),
                      },
                    },
                  },
                  following: {
                    label: t('panel_configuration_instance_configuration_layout_sidebar_following_label'),
                    type: 'section',
                    fields: {
                      enabled: {
                        label: t('panel_configuration_instance_configuration_layout_sidebar_following_enabled_label'),
                        type: 'boolean',
                        description: t('panel_configuration_instance_configuration_layout_sidebar_following_enabled_description'),
                      },
                    },
                  },
                  hiveInformation: {
                    label: t('panel_configuration_instance_configuration_layout_sidebar_hive_information_label'),
                    type: 'section',
                    fields: {
                      enabled: {
                        label: t('panel_configuration_instance_configuration_layout_sidebar_hive_information_enabled_label'),
                        type: 'boolean',
                        description: t('panel_configuration_instance_configuration_layout_sidebar_hive_information_enabled_description'),
                      },
                    },
                  },
                },
              },
            },
          },
          features: {
            label: t('panel_configuration_instance_configuration_features_label'),
            type: 'section',
            fields: {
              /**
               * Declared first so the posture question comes before the
               * individual feature toggles. Only the order among sections is
               * decided here: the editor renders every non-section field above
               * every section regardless of declaration order.
               *
               * Four scalars, two selects and two strings. No `number` field,
               * because the number input writes null when cleared, and no
               * array, because the hosting API drops an array holding objects
               * and still answers 200.
               *
               * Labels are hardcoded English, like every other label in this
               * panel. This module is a module-level constant evaluated before
               * the runtime config is loaded, so `t()` here would freeze
               * whichever language the bundle started with.
               */
              hive: {
                label: t('panel_configuration_instance_configuration_features_hive_label'),
                type: 'section',
                description: t('panel_configuration_instance_configuration_features_hive_description'),
                fields: {
                  readerLayer: {
                    label: t('panel_configuration_instance_configuration_features_hive_reader_layer_label'),
                    type: 'select',
                    // The value an absent key resolves to, so a config written
                    // before this block existed reads correctly here instead of
                    // showing an empty box.
                    default: HIVE_LAYER_CONFIG_DEFAULTS.readerLayer,
                    description: t('panel_configuration_instance_configuration_features_hive_reader_layer_description'),
                    options: [
                      { value: 'off', label: t('panel_configuration_instance_configuration_features_hive_reader_layer_off_option') },
                      { value: 'standard', label: t('panel_configuration_instance_configuration_features_hive_reader_layer_standard_option') },
                      { value: 'full', label: t('panel_configuration_instance_configuration_features_hive_reader_layer_full_option') },
                    ],
                  },
                  authorRewards: {
                    label: t('panel_configuration_instance_configuration_features_hive_author_rewards_label'),
                    type: 'select',
                    default: HIVE_LAYER_CONFIG_DEFAULTS.authorRewards,
                    description: t('panel_configuration_instance_configuration_features_hive_author_rewards_description'),
                    options: [
                      { value: 'off', label: t('panel_configuration_instance_configuration_features_hive_author_rewards_off_option') },
                      { value: 'author', label: t('panel_configuration_instance_configuration_features_hive_author_rewards_author_option') },
                    ],
                  },
                  payoutLabel: {
                    label: t('panel_configuration_instance_configuration_features_hive_payout_label_label'),
                    type: 'string',
                    default: HIVE_LAYER_CONFIG_DEFAULTS.payoutLabel,
                    // Same cap the resolver cuts at, so nothing typed here can
                    // be stored longer than it is shown.
                    maxLength: PAYOUT_LABEL_MAX_LENGTH,
                    // `t()` returns a plain string, so the cap goes in as a token
                    // the translation carries and this substitutes. A translator
                    // can move {max} wherever their grammar wants it.
                    description: t('panel_configuration_instance_configuration_features_hive_payout_label_description').replace(
                      '{max}',
                      String(PAYOUT_LABEL_MAX_LENGTH),
                    ),
                  },
                  learnMoreUrl: {
                    label: t('panel_configuration_instance_configuration_features_hive_learn_more_url_label'),
                    type: 'string',
                    default: HIVE_LAYER_CONFIG_DEFAULTS.learnMoreUrl,
                    description: t('panel_configuration_instance_configuration_features_hive_learn_more_url_description'),
                    // The resolver's own rule, not a copy of it. It refuses a
                    // relative address and any scheme but http(s), because the
                    // value becomes an href and a javascript: one must not
                    // reach the DOM. A refused link renders as plain text, so
                    // without this the owner sees no link and no reason.
                    validate: (value) =>
                      value.trim() === '' || resolveLearnMoreUrl(value) !== null
                        ? null
                        : t('panel_validation_learn_more_url'),
                  },
                },
              },
              postsFilters: {
                label: t('panel_configuration_instance_configuration_features_posts_filters_label'),
                type: 'array',
                description: t('panel_configuration_instance_configuration_features_posts_filters_description'),
              },
              likes: {
                label: t('panel_configuration_instance_configuration_features_likes_label'),
                type: 'section',
                fields: {
                  enabled: {
                    label: t('panel_configuration_instance_configuration_features_likes_enabled_label'),
                    type: 'boolean',
                    description: t('panel_configuration_instance_configuration_features_likes_enabled_description'),
                  },
                },
              },
              comments: {
                label: t('panel_configuration_instance_configuration_features_comments_label'),
                type: 'section',
                fields: {
                  enabled: {
                    label: t('panel_configuration_instance_configuration_features_comments_enabled_label'),
                    type: 'boolean',
                    description: t('panel_configuration_instance_configuration_features_comments_enabled_description'),
                  },
                },
              },
              post: {
                label: t('panel_configuration_instance_configuration_features_post_label'),
                type: 'section',
                fields: {
                  text2Speech: {
                    label: t('panel_configuration_instance_configuration_features_post_text2_speech_label'),
                    type: 'section',
                    fields: {
                      enabled: {
                        label: t('panel_configuration_instance_configuration_features_post_text2_speech_enabled_label'),
                        type: 'boolean',
                        description: t('panel_configuration_instance_configuration_features_post_text2_speech_enabled_description'),
                      },
                    },
                  },
                },
              },
              tipping: {
                label: t('panel_configuration_instance_configuration_features_tipping_label'),
                type: 'section',
                description: t('panel_configuration_instance_configuration_features_tipping_description'),
                fields: {
                  general: {
                    label: t('panel_configuration_instance_configuration_features_tipping_general_label'),
                    type: 'section',
                    fields: {
                      enabled: {
                        label: t('panel_configuration_instance_configuration_features_tipping_general_enabled_label'),
                        type: 'boolean',
                        description: t('panel_configuration_instance_configuration_features_tipping_general_enabled_description'),
                      },
                      buttonLabel: {
                        label: t('panel_configuration_instance_configuration_features_tipping_general_button_label_label'),
                        type: 'string',
                        description: t('panel_configuration_instance_configuration_features_tipping_general_button_label_description'),
                      },
                    },
                  },
                  post: {
                    label: t('panel_configuration_instance_configuration_features_tipping_post_label'),
                    type: 'section',
                    fields: {
                      enabled: {
                        label: t('panel_configuration_instance_configuration_features_tipping_post_enabled_label'),
                        type: 'boolean',
                        description: t('panel_configuration_instance_configuration_features_tipping_post_enabled_description'),
                      },
                      buttonLabel: {
                        label: t('panel_configuration_instance_configuration_features_tipping_post_button_label_label'),
                        type: 'string',
                        description: t('panel_configuration_instance_configuration_features_tipping_post_button_label_description'),
                      },
                    },
                  },
                  amounts: {
                    label: t('panel_configuration_instance_configuration_features_tipping_amounts_label'),
                    type: 'array',
                    description: t('panel_configuration_instance_configuration_features_tipping_amounts_description'),
                  },
                },
              },
              auth: {
                label: t('panel_configuration_instance_configuration_features_auth_label'),
                type: 'section',
                fields: {
                  enabled: {
                    label: t('panel_configuration_instance_configuration_features_auth_enabled_label'),
                    type: 'boolean',
                    description: t('panel_configuration_instance_configuration_features_auth_enabled_description'),
                  },
                  methods: {
                    label: t('panel_configuration_instance_configuration_features_auth_methods_label'),
                    type: 'array',
                    allowedValues: AUTH_METHODS,
                    description: t('panel_configuration_instance_configuration_features_auth_methods_description'),
                  },
                },
              },
            },
          },
        },
      },
      general: {
        label: t('panel_configuration_general_label'),
        type: 'section',
        fields: {
          theme: {
            label: t('panel_configuration_general_theme_label'),
            type: 'select',
            description: t('panel_configuration_general_theme_description'),
            options: [
              { value: 'system', label: t('panel_configuration_general_theme_system_option') },
              { value: 'light', label: t('panel_configuration_general_theme_light_option') },
              { value: 'dark', label: t('panel_configuration_general_theme_dark_option') },
            ],
          },
          styleTemplate: {
            label: t('panel_configuration_general_style_template_label'),
            type: 'select',
            description: t('panel_configuration_general_style_template_description'),
            options: STYLE_TEMPLATES.map((id) => ({
              value: id,
              label: t(STYLE_TEMPLATE_LABEL_KEYS[id]),
            })),
          },
          language: {
            label: t('panel_configuration_general_language_label'),
            type: 'select',
            description: t('panel_configuration_general_language_description'),
            options: [
              { value: 'en', label: t('panel_configuration_general_language_en_option') },
              { value: 'es', label: t('panel_configuration_general_language_es_option') },
              { value: 'de', label: t('panel_configuration_general_language_de_option') },
              { value: 'fr', label: t('panel_configuration_general_language_fr_option') },
              { value: 'ko', label: t('panel_configuration_general_language_ko_option') },
              { value: 'ru', label: t('panel_configuration_general_language_ru_option') },
              { value: 'pt', label: t('panel_configuration_general_language_pt_option') },
              { value: 'ja', label: t('panel_configuration_general_language_ja_option') },
              { value: 'zh', label: t('panel_configuration_general_language_zh_option') },
              { value: 'it', label: t('panel_configuration_general_language_it_option') },
              { value: 'pl', label: t('panel_configuration_general_language_pl_option') },
              { value: 'tr', label: t('panel_configuration_general_language_tr_option') },
            ],
          },
          timezone: {
            label: t('panel_configuration_general_timezone_label'),
            type: 'string',
            description: t('panel_configuration_general_timezone_description'),
          },
          dateFormat: {
            label: t('panel_configuration_general_date_format_label'),
            type: 'string',
            description: t('panel_configuration_general_date_format_description'),
          },
          timeFormat: {
            label: t('panel_configuration_general_time_format_label'),
            type: 'string',
            description: t('panel_configuration_general_time_format_description'),
          },
          dateTimeFormat: {
            label: t('panel_configuration_general_date_time_format_label'),
            type: 'string',
            description: t('panel_configuration_general_date_time_format_description'),
          },
          imageProxy: {
            label: t('panel_configuration_general_image_proxy_label'),
            type: 'string',
            description: t('panel_configuration_general_image_proxy_description'),
          },
          profileBaseUrl: {
            label: t('panel_configuration_general_profile_base_url_label'),
            type: 'string',
            description: t('panel_configuration_general_profile_base_url_description'),
          },
          createPostUrl: {
            label: t('panel_configuration_general_create_post_url_label'),
            type: 'string',
            description: t('panel_configuration_general_create_post_url_description'),
            // Two different silences, and they need different sentences.
            //
            // A community instance ignores this field entirely, valid or not:
            // the built-in editor is what carries the community target, and an
            // external composer would publish to the member's own blog instead.
            // So a community owner setting a perfectly good address gets no
            // composer and, before this, no explanation either.
            //
            // On a blog instance the question is the resolver's, asked of the
            // module that owns it, since `resolveCreatePostTarget` collapses
            // "left empty" and "refused" into one `internal` result.
            validate: (value, config) => {
              if (value.trim() === '') return null;
              if (isCommunityConfig(config)) {
                return t('panel_validation_create_post_url_community');
              }
              return isRefusedCreatePostUrl(value)
                ? t('panel_validation_create_post_url_refused')
                : null;
            },
          },
          hivesigner: {
            label: t('panel_configuration_general_hivesigner_label'),
            type: 'section',
            fields: {
              clientId: {
                label: t('panel_configuration_general_hivesigner_client_id_label'),
                // A text input, never a number one: the number input writes null
                // when cleared, and null erases the stored section on merge.
                type: 'string',
                description: t('panel_configuration_general_hivesigner_client_id_description'),
              },
            },
          },
          styles: {
            label: t('panel_configuration_general_styles_label'),
            type: 'section',
            fields: {
              /**
               * The two knobs `theme-appearance` derives the whole palette and
               * type scale from. They were read by `apply-config-dom` from the
               * moment that shipped, but no field described them, so the only
               * way to set either was to have written the config by hand.
               *
               * A text input rather than a colour input, matching `background`
               * beside it. The editor renders `string`, `select`, `boolean`,
               * `number` and `array`; a colour type would need a case of its
               * own, and a bare `<input type="color">` cannot express "unset",
               * which is the value every instance currently holds.
               */
              accent: {
                label: t('panel_configuration_general_styles_accent_label'),
                type: 'color',
                description: t('panel_configuration_general_styles_accent_description'),
                maxLength: 32,
                // The same curated row the signup offers; any readable hue
                // works, the instance derives hover and contrast from it.
                quickPicks: ['#e74c3c', '#e67e22', '#1a8917', '#0066cc', '#7c3aed', '#e91e8c'],
              },
              fontPreset: {
                label: t('panel_configuration_general_styles_font_preset_label'),
                type: 'select',
                description: t('panel_configuration_general_styles_font_preset_description'),
                // The exported list, not a copy: it already carries the empty
                // "Theme default" entry that is the only way back after a
                // preset has been chosen, and a second list here would drift.
                options: [...FONT_PRESET_OPTIONS],
                default: '',
                // resolveFontPreset trims and lower-cases, so a hand-written
                // `"Classic"` applies the Classic pairing. Without this the
                // panel would match the options exactly, show "Theme default",
                // and disagree with the site it is describing.
                normalizesCase: true,
              },
              background: {
                label: t('panel_configuration_general_styles_background_label'),
                type: 'string',
                description: t('panel_configuration_general_styles_background_description'),
              },
            },
          },
        },
      },
    },
  },
};
}

/**
 * A pruned, root-shaped copy of a field tree holding only the named subtrees,
 * with every ancestor section's chrome (label, description, visibility)
 * preserved. The tabbed editor is the consumer: each task-oriented tab is a
 * curated pick over the ONE schema, so a field can never exist in a tab
 * without existing in Advanced, and unknown paths contribute nothing rather
 * than throwing (a curation typo must not take the panel down).
 */
export function pickFields(
  fields: Record<string, ConfigField>,
  paths: readonly string[],
): Record<string, ConfigField> {
  const result: Record<string, ConfigField> = {};
  for (const path of paths) {
    const segments = path.split('.');
    let sourceLevel: Record<string, ConfigField> | undefined = fields;
    let resultLevel = result;
    for (let i = 0; i < segments.length; i += 1) {
      const key = segments[i];
      const source: ConfigField | undefined = sourceLevel?.[key];
      if (!source) break;
      if (i === segments.length - 1) {
        resultLevel[key] = source;
        break;
      }
      const existing = resultLevel[key];
      const wrapper = existing ?? { ...source, fields: {} };
      if (!existing) resultLevel[key] = wrapper;
      resultLevel = wrapper.fields as Record<string, ConfigField>;
      sourceLevel = source.fields;
    }
  }
  return result;
}
