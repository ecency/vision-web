export type ConfigFieldType =
  | 'string'
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
                    description: 'Available login methods: keychain, hivesigner, hiveauth',
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
          },
          styles: {
            label: 'Styles',
            type: 'section',
            fields: {
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
