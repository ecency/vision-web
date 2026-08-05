// Imported from the module rather than the `@/core` barrel on purpose: the
// barrel pulls `configuration-loader`, which imports the build-time
// `config.json`. That file is gitignored and absent in CI, so the barrel would
// make this module, and every test that reads it, unloadable there.
import {
  HIVE_LAYER_CONFIG_DEFAULTS,
  PAYOUT_LABEL_MAX_LENGTH,
  resolveLearnMoreUrl,
} from '@/core/hive-layer';
import { FONT_PRESET_OPTIONS } from '@/core/theme-appearance';
import { AUTH_METHODS } from '@/features/auth/utils/auth-methods';
import { isRefusedCreatePostUrl } from '@/features/auth/utils/create-post-target';

export type ConfigFieldType =
  | 'string'
  // A hex colour: a native swatch beside a text input. The swatch alone cannot
  // express "unset", which is the value every instance holds today and the one
  // an owner has to be able to get back to.
  | 'color'
  | 'number'
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
   */
  validate?: (value: string) => string | null;
}

export const configFieldsMap: Record<string, ConfigField> = {
  version: {
    label: 'Version',
    type: 'number',
    description: 'Configuration version number',
  },
  configuration: {
    label: 'Configuration',
    type: 'section',
    fields: {
      instanceConfiguration: {
        label: 'Instance Configuration',
        type: 'section',
        fields: {
          type: {
            label: 'Instance Type',
            type: 'select',
            description: 'Blog (personal) or Community mode',
            options: [
              { value: 'blog', label: 'Blog (Personal)' },
              { value: 'community', label: 'Community' },
            ],
          },
          username: {
            label: 'Username',
            type: 'string',
            description: 'Blog owner username (for blog mode)',
          },
          communityId: {
            label: 'Community ID',
            type: 'string',
            description: 'Hive community ID (e.g., hive-123456) for community mode',
          },
          meta: {
            label: 'Meta Information',
            type: 'section',
            fields: {
              title: {
                label: 'Title',
                type: 'string',
                description: 'Site title',
              },
              description: {
                label: 'Description',
                type: 'string',
                description: 'Site description',
              },
              logo: {
                label: 'Logo URL',
                type: 'string',
                description: 'Logo image URL',
              },
              favicon: {
                label: 'Favicon URL',
                type: 'string',
                description: 'Favicon image URL',
              },
              keywords: {
                label: 'Keywords',
                type: 'string',
                description: 'SEO keywords',
              },
            },
          },
          layout: {
            label: 'Layout Settings',
            type: 'section',
            fields: {
              listType: {
                label: 'List Type',
                type: 'select',
                description: 'Type of list display',
                options: [
                  { value: 'list', label: 'List View' },
                  { value: 'grid', label: 'Grid View' },
                ],
              },
              search: {
                label: 'Search',
                type: 'section',
                fields: {
                  enabled: {
                    label: 'Enabled',
                    type: 'boolean',
                    description: 'Enable search functionality',
                  },
                },
              },
              sidebar: {
                label: 'Sidebar',
                type: 'section',
                fields: {
                  placement: {
                    label: 'Placement',
                    type: 'select',
                    description: 'Sidebar placement',
                    options: [
                      { value: 'left', label: 'Left' },
                      { value: 'right', label: 'Right' },
                    ],
                  },
                  followers: {
                    label: 'Followers',
                    type: 'section',
                    fields: {
                      enabled: {
                        label: 'Enabled',
                        type: 'boolean',
                        description: 'Show followers section',
                      },
                    },
                  },
                  following: {
                    label: 'Following',
                    type: 'section',
                    fields: {
                      enabled: {
                        label: 'Enabled',
                        type: 'boolean',
                        description: 'Show following section',
                      },
                    },
                  },
                  hiveInformation: {
                    label: 'Hive Information',
                    type: 'section',
                    fields: {
                      enabled: {
                        label: 'Enabled',
                        type: 'boolean',
                        description: 'Show Hive information',
                      },
                    },
                  },
                },
              },
            },
          },
          features: {
            label: 'Features',
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
                label: 'Hive layer',
                type: 'section',
                description:
                  'How much of the Hive blockchain this site shows readers. Notices that voting, commenting and publishing are permanent are always shown and are not affected by these settings. Save and reload to see changes.',
                fields: {
                  readerLayer: {
                    label: 'Show Hive activity to readers',
                    type: 'select',
                    // The value an absent key resolves to, so a config written
                    // before this block existed reads correctly here instead of
                    // showing an empty box.
                    default: HIVE_LAYER_CONFIG_DEFAULTS.readerLayer,
                    description:
                      'Off shows no earnings and no links to Hive. Standard shows what a post earned, when its payout closes, and a link to it on Hive. Full also shows earnings on post cards in the list.',
                    options: [
                      { value: 'off', label: 'Off' },
                      { value: 'standard', label: 'Standard' },
                      { value: 'full', label: 'Full' },
                    ],
                  },
                  authorRewards: {
                    label: 'Reward controls when writing',
                    type: 'select',
                    default: HIVE_LAYER_CONFIG_DEFAULTS.authorRewards,
                    description:
                      'Off publishes with the usual Hive reward setting. Author chooses offers the writer all Hive Power or declining rewards, picked once at publish and not editable afterwards. Applies only to posts written here, so it does nothing when Create Post URL points at another site.',
                    options: [
                      { value: 'off', label: 'Off' },
                      { value: 'author', label: 'Author chooses' },
                    ],
                  },
                  payoutLabel: {
                    label: 'Earnings label',
                    type: 'string',
                    default: HIVE_LAYER_CONFIG_DEFAULTS.payoutLabel,
                    // Same cap the resolver cuts at, so nothing typed here can
                    // be stored longer than it is shown.
                    maxLength: PAYOUT_LABEL_MAX_LENGTH,
                    description: `Your own word for what a post earned, for example Rewards or Tips from readers. Leave empty for the built-in wording. Longer than ${PAYOUT_LABEL_MAX_LENGTH} characters is cut where it is shown.`,
                  },
                  learnMoreUrl: {
                    label: 'Learn more link',
                    type: 'string',
                    default: HIVE_LAYER_CONFIG_DEFAULTS.learnMoreUrl,
                    description:
                      'Leave empty to show the Hive note as plain text. Add a full https address and the note becomes a link to it.',
                    // The resolver's own rule, not a copy of it. It refuses a
                    // relative address and any scheme but http(s), because the
                    // value becomes an href and a javascript: one must not
                    // reach the DOM. A refused link renders as plain text, so
                    // without this the owner sees no link and no reason.
                    validate: (value) =>
                      value.trim() === '' || resolveLearnMoreUrl(value) !== null
                        ? null
                        : 'Not a web address the site will link to, so the note stays plain text. Use a full https address.',
                  },
                },
              },
              postsFilters: {
                label: 'Post Filters',
                type: 'array',
                description: 'Available post filter types (blog: blog, posts, comments, replies | community: trending, hot, created)',
              },
              likes: {
                label: 'Likes',
                type: 'section',
                fields: {
                  enabled: {
                    label: 'Enabled',
                    type: 'boolean',
                    description: 'Enable likes feature',
                  },
                },
              },
              comments: {
                label: 'Comments',
                type: 'section',
                fields: {
                  enabled: {
                    label: 'Enabled',
                    type: 'boolean',
                    description: 'Enable comments feature',
                  },
                },
              },
              post: {
                label: 'Post',
                type: 'section',
                fields: {
                  text2Speech: {
                    label: 'Text to Speech',
                    type: 'section',
                    fields: {
                      enabled: {
                        label: 'Enabled',
                        type: 'boolean',
                        description: 'Enable text to speech',
                      },
                    },
                  },
                },
              },
              tipping: {
                label: 'Tipping',
                type: 'section',
                description: 'Tip button in posts and sidebar',
                fields: {
                  general: {
                    label: 'Sidebar (General)',
                    type: 'section',
                    fields: {
                      enabled: {
                        label: 'Enabled',
                        type: 'boolean',
                        description: 'Show Tip button in sidebar',
                      },
                      buttonLabel: {
                        label: 'Button Label',
                        type: 'string',
                        description: 'Custom label for Tip button (e.g. Tip)',
                      },
                    },
                  },
                  post: {
                    label: 'Post',
                    type: 'section',
                    fields: {
                      enabled: {
                        label: 'Enabled',
                        type: 'boolean',
                        description: 'Show Tip button in post footer',
                      },
                      buttonLabel: {
                        label: 'Button Label',
                        type: 'string',
                        description: 'Custom label for Tip button (e.g. Tip)',
                      },
                    },
                  },
                  amounts: {
                    label: 'Preset Amounts',
                    type: 'array',
                    description: 'Preset amounts in USD for tip buttons (e.g. 1, 5, 10)',
                  },
                },
              },
              auth: {
                label: 'Authentication',
                type: 'section',
                fields: {
                  enabled: {
                    label: 'Enabled',
                    type: 'boolean',
                    description: 'Enable user authentication for interactions',
                  },
                  methods: {
                    label: 'Auth Methods',
                    type: 'array',
                    allowedValues: AUTH_METHODS,
                    description:
                      'Available login methods: keychain, hivesigner, hiveauth. Hivesigner also needs a client id under General Settings > Hivesigner, which blogs hosted by Ecency are given automatically.',
                  },
                },
              },
            },
          },
        },
      },
      general: {
        label: 'General Settings',
        type: 'section',
        fields: {
          theme: {
            label: 'Theme',
            type: 'select',
            description: 'Theme setting (system, light, dark)',
            options: [
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ],
          },
          styleTemplate: {
            label: 'Style Template',
            type: 'select',
            description: 'Visual style template for the blog',
            options: [
              { value: 'medium', label: 'Medium (Editorial)' },
              { value: 'minimal', label: 'Minimal (Clean)' },
              { value: 'magazine', label: 'Magazine (Editorial)' },
              { value: 'developer', label: 'Developer (Tech)' },
              { value: 'modern-gradient', label: 'Modern Gradient' },
            ],
          },
          language: {
            label: 'Language',
            type: 'select',
            description: 'Default language',
            options: [
              { value: 'en', label: 'English' },
              { value: 'es', label: 'Spanish' },
              { value: 'de', label: 'German' },
              { value: 'fr', label: 'French' },
              { value: 'ko', label: 'Korean' },
              { value: 'ru', label: 'Russian' },
              { value: 'pt', label: 'Portuguese' },
              { value: 'ja', label: 'Japanese' },
              { value: 'zh', label: 'Chinese' },
              { value: 'it', label: 'Italian' },
              { value: 'pl', label: 'Polish' },
              { value: 'tr', label: 'Turkish' },
            ],
          },
          timezone: {
            label: 'Timezone',
            type: 'string',
            description: 'Default timezone',
          },
          dateFormat: {
            label: 'Date Format',
            type: 'string',
            description: 'Date format pattern',
          },
          timeFormat: {
            label: 'Time Format',
            type: 'string',
            description: 'Time format pattern',
          },
          dateTimeFormat: {
            label: 'Date Time Format',
            type: 'string',
            description: 'Date and time format pattern',
          },
          imageProxy: {
            label: 'Image Proxy URL',
            type: 'string',
            description: 'Image proxy base URL (e.g., https://i.ecency.com)',
          },
          profileBaseUrl: {
            label: 'Profile Base URL',
            type: 'string',
            description: 'Base URL for user profiles (e.g., https://ecency.com/@)',
          },
          createPostUrl: {
            label: 'Create Post URL',
            type: 'string',
            description:
              'Optional external composer for the Create post button. Leave empty to write here with the built-in editor. The old default https://ecency.com/publish also means the built-in editor.',
            // Asked of the module that owns the rule. `resolveCreatePostTarget`
            // collapses "left empty" and "refused" into the same `internal`
            // result, so the panel cannot tell them apart; the owner who typed
            // an external composer and silently got the built-in editor is the
            // case worth naming.
            validate: (value) =>
              isRefusedCreatePostUrl(value)
                ? 'Not a web address the site will open, so the Create post button uses the built-in editor. Use a full https address.'
                : null,
          },
          hivesigner: {
            label: 'Hivesigner',
            type: 'section',
            fields: {
              clientId: {
                label: 'Hivesigner Client ID',
                // A text input, never a number one: the number input writes null
                // when cleared, and null erases the stored section on merge.
                type: 'string',
                description:
                  "Hivesigner login stays hidden until this is set. On a blog hosted by Ecency the shared ecency.app app is filled in for you, once this site's /auth address has been registered on chain, so there is normally nothing to do here. To use a different app instead, register your own and put its id here; it is never overwritten. On a self-hosted instance nothing fills this in for you: either register your own app and put its id here, or email hello@ecency.com to get this site's /auth address registered on the shared app and then put ecency.app here.",
              },
            },
          },
          styles: {
            label: 'Styles',
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
                label: 'Accent color',
                type: 'color',
                description:
                  "One color, as a hex value such as #0969da. Buttons, links, the active feed tab and focus rings derive from it, and the text that sits on it is corrected automatically to stay readable. Leave empty to keep the style template's own color.",
                maxLength: 32,
              },
              fontPreset: {
                label: 'Fonts',
                type: 'select',
                description:
                  'A body and heading pairing. Leave on Theme default to keep the faces the style template ships with.',
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
                label: 'Background',
                type: 'string',
                description: 'CSS classes for background styling',
              },
            },
          },
        },
      },
    },
  },
};
