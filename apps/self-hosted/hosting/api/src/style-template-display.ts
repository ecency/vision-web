import { DEFAULT_STYLE_TEMPLATE, type StyleTemplate } from './style-templates';

/**
 * Presentation metadata for the template picker (GET /v1/templates). The
 * signup UI renders its cards from this, so the list can never drift from the
 * roster: the map is `satisfies Record<StyleTemplate, ...>`, and adding a
 * roster entry fails this file's typecheck until its card exists.
 *
 * Colors are the template's own light-mode tokens (bg-primary, bg-secondary,
 * accent, text-primary from src/styles/themes/<id>.css), duplicated here as
 * plain values because the CSS lives in the SPA image and this API cannot
 * read it. The roster guard suite keeps ids honest; these swatches are
 * decorative and safe to lag a token tweak.
 */
export interface StyleTemplateDisplay {
  name: string;
  tagline: string;
  colors: {
    background: string;
    surface: string;
    accent: string;
    text: string;
  };
  /** Broad classification for the card's type sample, not a font stack. */
  headingStyle: 'serif' | 'sans' | 'mono';
}

export const STYLE_TEMPLATE_DISPLAY = {
  medium: {
    name: 'Medium',
    tagline: 'Clean long-form reading with a classic serif voice',
    colors: {
      background: '#ffffff',
      surface: '#fafafa',
      accent: 'rgba(0, 0, 0, 0.84)',
      text: 'rgba(0, 0, 0, 0.84)',
    },
    headingStyle: 'serif',
  },
  minimal: {
    name: 'Minimal',
    tagline: 'Quiet, spacious and out of the way of your words',
    colors: {
      background: '#ffffff',
      surface: '#fafafa',
      accent: '#0066cc',
      text: '#1a1a1a',
    },
    headingStyle: 'sans',
  },
  magazine: {
    name: 'Magazine',
    tagline: 'Warm editorial look with display headlines',
    colors: {
      background: '#faf8f5',
      surface: '#f5f2ed',
      accent: '#8b4513',
      text: '#2c2825',
    },
    headingStyle: 'serif',
  },
  developer: {
    name: 'Developer',
    tagline: 'Dark, code-friendly and easy on late-night eyes',
    colors: {
      background: '#1e1e2e',
      surface: '#181825',
      accent: '#89b4fa',
      text: '#cdd6f4',
    },
    headingStyle: 'mono',
  },
  'modern-gradient': {
    name: 'Modern',
    tagline: 'Bright surfaces with a vivid accent',
    colors: {
      background: '#f8fafc',
      surface: '#ffffff',
      accent: '#7c3aed',
      text: '#0f172a',
    },
    headingStyle: 'sans',
  },
  journal: {
    name: 'Journal',
    tagline: 'Ink on paper: one quiet column for long-form writing',
    colors: {
      background: '#faf8f4',
      surface: '#f2efe8',
      accent: '#9c4a1e',
      text: '#221d17',
    },
    headingStyle: 'serif',
  },
  reader: {
    name: 'Reader',
    tagline: 'Your archive beside the open post, the way a feed reader works',
    colors: {
      background: '#ffffff',
      surface: '#f6f6f4',
      accent: '#17677a',
      text: '#1c1e21',
    },
    headingStyle: 'sans',
  },
  gallery: {
    name: 'Gallery',
    tagline: 'A wall of pictures: the image leads, the words step back',
    colors: {
      background: '#f6f6f4',
      surface: '#ffffff',
      accent: '#37596b',
      text: '#1b1b1a',
    },
    headingStyle: 'sans',
  },
} satisfies Record<StyleTemplate, StyleTemplateDisplay>;

export function templateCatalog() {
  return Object.entries(STYLE_TEMPLATE_DISPLAY).map(([id, display]) => ({
    id,
    isDefault: id === DEFAULT_STYLE_TEMPLATE,
    ...display,
  }));
}
