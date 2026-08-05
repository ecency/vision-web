import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCENT_CONTRAST_TARGET,
  ACCENT_TINT_PERCENT,
  accentContrastColor,
  accentTextForMode,
  contrastRatio,
  formatHexColor,
  parseHexColor,
  type Rgb,
  relativeLuminance,
} from '../core/theme-appearance';

/**
 * What the theme files must keep true for the accent knob to be safe.
 *
 * The accent now drives the tag chips: their fill is a tint of it, declared
 * once in variables.css, and their text is the corrected accent as soon as an
 * owner configures one. With no accent configured the chip text stays the
 * template's own colour, so the pairing that ships to an instance that
 * configures nothing is the pairing that shipped before. Both of those states
 * have to clear 4.5:1, and only one of them is provable from the stylesheet;
 * the other is proved over every colour in core/theme-appearance.test.ts.
 *
 * Also here: the card treatment. modern-gradient's glass used to hang off
 * `.bg-theme-card`, a Tailwind utility name no component renders, so the
 * default template's defining look painted on nothing at all. It is now three
 * tokens that `.card-theme` reads, which means every template has to have an
 * opinion about what a card is rather than inheriting one by accident.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const THEMES = join(HERE, 'themes');
const COMPONENTS = join(HERE, 'components.css');
const TOKENS = join(HERE, 'theme-tokens.css');

interface Block {
  file: string;
  selector: string;
  declarations: Map<string, string>;
}

/** Top-level `selector { ... }` blocks of a theme file, comments removed. */
function blocks(file: string): Block[] {
  return parseBlocks(readFileSync(join(THEMES, file), 'utf8'), file);
}

/**
 * Every `selector { ... }` rule of a stylesheet, comments removed.
 *
 * At-rule bodies are recursed into and their rules FLATTENED into the same
 * list, not skipped: hover rules now live inside `@media (hover: hover)`, and
 * treating an at-rule as opaque hid them from every assertion about them.
 *
 * Two consequences of flattening, both fine here and both worth knowing. Order
 * is source order, so a rule inside a media block appears after the base rule
 * it overrides. And the same selector can appear twice, once bare and once
 * media-scoped; `componentRule` takes the first match, which is the base rule,
 * because that is the one these assertions are about.
 */
function parseBlocks(source: string, file: string): Block[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Block[] = [];
  let prelude = '';
  let depth = 0;
  let start = 0;

  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    if (depth === 0) {
      if (char === '{') {
        depth = 1;
        start = index + 1;
      } else {
        prelude += char;
      }
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth > 0) continue;
      const selector = prelude.trim().replace(/\s+/g, ' ');
      if (selector.startsWith('@')) {
        // Recurse rather than discard. Hover rules now live inside
        // `@media (hover: hover)`, so treating an at-rule's body as opaque
        // hid `.btn-theme-primary:hover:not(:disabled)` from every assertion
        // about it and failed with "components.css has no such rule".
        out.push(...parseBlocks(css.slice(start, index), file));
      } else {
        out.push({
          file,
          selector,
          declarations: declarations(css.slice(start, index)),
        });
      }
      prelude = '';
    }
  }
  return out;
}

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ';' && depth === 0) {
      const at = current.indexOf(':');
      if (at > 0)
        out.set(current.slice(0, at).trim(), current.slice(at + 1).trim());
      current = '';
      continue;
    }
    current += char;
  }
  return out;
}

const ALL_BLOCKS = readdirSync(THEMES)
  .filter((file) => file.endsWith('.css'))
  .flatMap(blocks);

/** `rgba(0, 0, 0, 0.84)` and `#rrggbb` alike, as colour plus alpha. */
function parseColor(value: string): { rgb: Rgb; alpha: number } | null {
  const hex = parseHexColor(value);
  if (hex) return { rgb: hex, alpha: 1 };
  const match = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (!match) return null;
  const parts = match[1].split(',').map((part) => Number.parseFloat(part));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return {
    rgb: [parts[0], parts[1], parts[2]],
    alpha: parts.length > 3 ? parts[3] : 1,
  };
}

function composite(
  over: { rgb: Rgb; alpha: number },
  onto: Rgb,
  scale = 1,
): Rgb {
  const alpha = over.alpha * scale;
  return [
    over.rgb[0] * alpha + onto[0] * (1 - alpha),
    over.rgb[1] * alpha + onto[1] * (1 - alpha),
    over.rgb[2] * alpha + onto[2] * (1 - alpha),
  ];
}

/** The literal a `var(--x, literal)` falls back to, resolved within one block. */
function fallbackOf(value: string, block: Block): string | null {
  const match = /^var\(\s*(--[a-z0-9-]+)\s*,\s*([\s\S]+)\)$/i.exec(
    value.trim(),
  );
  if (!match) return value.trim();
  const fallback = match[2].trim();
  if (fallback.startsWith('var(')) {
    const inner = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(fallback);
    const referenced = inner && block.declarations.get(inner[1]);
    return referenced ? referenced.trim() : null;
  }
  return fallback;
}

const accentBlocks = ALL_BLOCKS.filter((block) =>
  block.declarations.has('--theme-accent'),
);

describe('accent blocks', () => {
  it('are every light and dark palette the templates declare', () => {
    // Five templates in two modes, plus the two base blocks in variables.css.
    // A parser that stopped seeing them would make every check below vacuous.
    expect(accentBlocks.length).toBe(12);
    expect(new Set(accentBlocks.map((block) => block.file)).size).toBe(6);
  });

  it('declare the chip text next to the accent that fills the chip', () => {
    // The pair is what the contrast check below is computed from. A block that
    // declared one without the other would take its chip text from another
    // block's palette, and neither block would be wrong on its own.
    const missing = accentBlocks
      .filter((block) => !block.declarations.has('--theme-tag-text'))
      .map((block) => `${block.file} ${block.selector}`);

    expect(missing).toEqual([]);
  });

  it('read the correction variant that belongs to their own mode', () => {
    // developer is the trap: its base block is the DARK palette and
    // [data-theme="light"] is the override, so matching on the selector rather
    // than on the surface would give it the light correction in dark mode.
    const wrong: string[] = [];

    for (const block of accentBlocks) {
      const surface = parseColor(
        block.declarations.get('--theme-bg-primary') ?? '',
      );
      const tagText = block.declarations.get('--theme-tag-text') ?? '';
      if (!surface) {
        wrong.push(`${block.file} ${block.selector}: no --theme-bg-primary`);
        continue;
      }
      const expected =
        relativeLuminance(surface.rgb) >= 0.5
          ? '--theme-accent-text-light'
          : '--theme-accent-text-dark';
      if (!tagText.includes(expected)) {
        wrong.push(`${block.file} ${block.selector}: ${tagText}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('produce a readable tag chip with no accent configured', () => {
    // The chip is ACCENT_TINT_PERCENT of the block's own accent composited over
    // its own page, and the text is the fallback the template keeps for an
    // instance that configures nothing. That is what all 27 live instances
    // render, so it is the pairing that must not regress.
    const failures: string[] = [];

    for (const block of accentBlocks) {
      const accent = parseColor(block.declarations.get('--theme-accent') ?? '');
      const surface = parseColor(
        block.declarations.get('--theme-bg-primary') ?? '',
      );
      const fallback = fallbackOf(
        block.declarations.get('--theme-tag-text') ?? '',
        block,
      );
      const text = fallback ? parseColor(fallback) : null;

      if (!accent || !surface || !text) {
        failures.push(
          `${block.file} ${block.selector}: unreadable declarations`,
        );
        continue;
      }

      const chip = composite(accent, surface.rgb, ACCENT_TINT_PERCENT / 100);
      const ratio = contrastRatio(composite(text, chip), chip);
      if (ratio < ACCENT_CONTRAST_TARGET) {
        failures.push(
          `${block.file} ${block.selector}: ${ratio.toFixed(2)}:1 on the chip`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});

describe('derived accent tokens', () => {
  const variables = blocks('variables.css');
  const derived = [
    '--theme-accent-shade',
    '--theme-accent-text',
    '--theme-tag-bg',
    '--theme-tag-text',
  ];

  it('are declared for both modes, never on :root alone', () => {
    // var() substitutes at computed-value time on the element carrying the
    // declaration and the RESULT inherits, so a derived property declared only
    // on :root resolves once against <html> and hands that one concrete colour
    // to every descendant, including a subtree that carries its own data-theme.
    const missing: string[] = [];
    for (const property of derived) {
      for (const mode of ['light', 'dark']) {
        const declared = variables.some(
          (block) =>
            block.selector.includes(`[data-theme="${mode}"]`) &&
            block.declarations.has(property),
        );
        if (!declared) missing.push(`${property} (${mode})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('mix the chip fill from the accent, at the percentage the module corrects for', () => {
    const mixes = variables
      .map((block) => block.declarations.get('--theme-tag-bg'))
      .filter((value): value is string => Boolean(value));

    expect(mixes.length).toBe(2);
    for (const mix of mixes) {
      expect(mix).toContain('var(--theme-accent)');
      // Transparent-first: the build turns a color-mix into a plain fallback by
      // taking its first colour, and a chip filled with the accent at full
      // strength would put the template's quiet chip text on the accent itself.
      expect(mix).toMatch(/color-mix\(in srgb, transparent (\d+)%/);
      expect(100 - Number(/transparent (\d+)%/.exec(mix)?.[1])).toBe(
        ACCENT_TINT_PERCENT,
      );
    }
  });

  it('leave an unconfigured instance on the template accent', () => {
    // The fallback in each var() is what makes "no accent configured" render
    // byte-identically to the day before this knob existed.
    for (const block of variables) {
      const accentText = block.declarations.get('--theme-accent-text');
      if (!accentText) continue;
      expect(accentText).toMatch(
        /var\(--theme-accent-text-(light|dark), var\(--theme-accent\)\)/,
      );
    }
  });
});

describe('card treatment', () => {
  const CARD_TOKENS = [
    '--theme-card-bg',
    '--theme-card-border',
    '--theme-card-backdrop',
  ];
  const templates = ALL_BLOCKS.filter((block) =>
    /^\[data-style-template="[a-z-]+"\]$/.test(block.selector),
  );

  it('is stated by every template rather than inherited by accident', () => {
    expect(templates.length).toBe(5);
    const missing: string[] = [];
    for (const block of templates) {
      for (const token of CARD_TOKENS) {
        if (!block.declarations.has(token)) {
          missing.push(`${block.file}: ${token}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('is glass on exactly the template named after it', () => {
    const glass = templates.filter((block) =>
      (block.declarations.get('--theme-card-backdrop') ?? 'none').includes(
        'blur',
      ),
    );
    expect(glass.map((block) => block.file)).toEqual(['modern-gradient.css']);
  });

  it('is read by .card-theme, so a template token is not decoration', () => {
    const card = readFileSync(COMPONENTS, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .match(/\.card-theme\s*\{([^}]*)\}/);

    expect(card).not.toBeNull();
    for (const token of CARD_TOKENS) {
      expect(card?.[1]).toContain(`var(${token}`);
    }
  });
});

describe('theme files', () => {
  /** The utility class names theme-tokens.css makes Tailwind generate. */
  function generatedClasses(): Set<string> {
    const css = readFileSync(TOKENS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const namespaces: Array<[string, string[]]> = [
      ['--background-color-', ['bg-']],
      ['--text-color-', ['text-']],
      ['--border-color-', ['border-']],
      ['--radius-', ['rounded-']],
      ['--font-', ['font-']],
      ['--shadow-', ['shadow-']],
      ['--color-', ['bg-', 'text-', 'border-', 'ring-', 'fill-', 'stroke-']],
    ];

    const out = new Set<string>();
    for (const [property] of [...css.matchAll(/(--[a-z0-9-]+):/g)].map(
      (match) => [match[1]],
    )) {
      for (const [prefix, utilities] of namespaces) {
        if (!property.startsWith(prefix)) continue;
        const name = property.slice(prefix.length);
        for (const utility of utilities) out.add(`${utility}${name}`);
        break;
      }
    }
    return out;
  }

  it('style no class that Tailwind generates from a theme namespace', () => {
    // `[data-style-template="modern-gradient"] .bg-theme-card` is why this
    // exists: a template rule aimed at a utility class name is unreachable when
    // no component writes it, and a cascade landmine when one does, since the
    // theme files are unlayered and would beat the utility.
    const generated = generatedClasses();
    expect(generated.size).toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const block of ALL_BLOCKS) {
      for (const match of block.selector.matchAll(
        /\.([a-z0-9][a-z0-9_-]*)/gi,
      )) {
        if (generated.has(match[1])) {
          offenders.push(`${block.file}: ${block.selector}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

// =============================================================================
// Accent plumbing: the tokens the accent reaches once it is wired
// =============================================================================

/**
 * Everything below resolves a declaration to an actual colour before asserting
 * anything about it. Nothing here matches on a token's spelling, because a
 * guard that greps for `var(--theme-accent)` passes on
 * `color-mix(in srgb, var(--theme-accent) 0%, transparent)` and on a value that
 * names the accent in a property nothing reads.
 */

/** A colour with its alpha, before it is put on any surface. */
interface Colour {
  rgb: Rgb;
  alpha: number;
}

const COLOUR_KEYWORDS: Record<string, Colour> = {
  transparent: { rgb: [0, 0, 0], alpha: 0 },
};

/**
 * A declaration value resolved to a colour, substituting the custom properties
 * the SAME block declares.
 *
 * Same block, deliberately: a var() in a custom property substitutes at
 * computed-value time on the element carrying the declaration, and every block
 * here matches <html>. Resolving against the declaring block is what makes
 * "this template derives its own underline" checkable one block at a time
 * instead of by simulating the cascade.
 *
 * A `var(--x, fallback)` whose --x no block declares takes the fallback, which
 * is exactly the instance-with-no-accent-configured case: --theme-accent-text-*
 * is written inline on <html> by applyConfigDom and never appears in CSS.
 */
function resolveColour(value: string, block: Block, depth = 0): Colour | null {
  if (depth > 8) return null;
  const raw = value.trim();

  const keyword = COLOUR_KEYWORDS[raw.toLowerCase()];
  if (keyword) return keyword;

  const literal = parseColor(raw);
  if (literal) return literal;

  const varMatch = /^var\(\s*(--[a-z0-9-]+)\s*(?:,([\s\S]+))?\)$/i.exec(raw);
  if (varMatch) {
    const declared = block.declarations.get(varMatch[1]);
    if (declared !== undefined)
      return resolveColour(declared, block, depth + 1);
    if (varMatch[2] === undefined) return null;
    return resolveColour(varMatch[2], block, depth + 1);
  }

  // color-mix(in <space>, A p%, B) with one side transparent, which is the only
  // shape the theme files use. Percentages are read, not assumed.
  const mix = /^color-mix\(\s*in\s+[a-z-]+\s*,([\s\S]+)\)$/i.exec(raw);
  if (mix) {
    const parts = splitTopLevel(mix[1]);
    if (parts.length !== 2) return null;
    const sides = parts.map((part) => {
      const percent = /\s(\d+(?:\.\d+)?)%\s*$/.exec(part);
      return {
        colour: part.replace(/\s(\d+(?:\.\d+)?)%\s*$/, '').trim(),
        percent: percent ? Number(percent[1]) : null,
      };
    });
    const opaqueAt = sides.findIndex(
      (side) => side.colour.toLowerCase() !== 'transparent',
    );
    if (opaqueAt < 0) return null;
    const opaque = sides[opaqueAt];
    const other = sides[1 - opaqueAt];
    if (other.colour.toLowerCase() !== 'transparent') return null;
    const share =
      opaque.percent !== null
        ? opaque.percent
        : other.percent !== null
          ? 100 - other.percent
          : null;
    if (share === null) return null;
    const base = resolveColour(opaque.colour, block, depth + 1);
    if (!base) return null;
    return { rgb: base.rgb, alpha: base.alpha * (share / 100) };
  }

  return null;
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of input) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current);
  return out.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** The colour a declaration paints when it lands on that block's own page. */
function onPage(value: string, block: Block): Rgb | null {
  const colour = resolveColour(value, block);
  const page = parseColor(block.declarations.get('--theme-bg-primary') ?? '');
  if (!colour || !page) return null;
  return composite(colour, page.rgb);
}

function near(a: Rgb, b: Rgb): boolean {
  return a.every((channel, index) => Math.abs(channel - b[index]) < 0.75);
}

function label(block: Block): string {
  return `${block.file} ${block.selector}`;
}

/** The accent fill each block paints, which is what everything here is against. */
function accentFill(block: Block): Rgb {
  const fill = onPage('var(--theme-accent)', block);
  if (!fill) throw new Error(`${label(block)}: unresolvable --theme-accent`);
  return fill;
}

function page(block: Block): Rgb {
  const surface = parseColor(
    block.declarations.get('--theme-bg-primary') ?? '',
  );
  if (!surface)
    throw new Error(`${label(block)}: unresolvable --theme-bg-primary`);
  return surface.rgb;
}

/** WCAG 1.4.11: a non-text state indicator wants 3:1 against what surrounds it. */
const INDICATOR_TARGET = 3;

/**
 * The resting underline is a decoration, not a state indicator, and is meant to
 * be quiet: the twelve palettes ship it between 1.74:1 and 3.42:1. WCAG sets no
 * minimum for a text decoration, so this floor is empirical rather than
 * borrowed, and it exists to catch one thing: an underline that reaches the
 * page colour and stops being a mark at all.
 *
 * 1.6 is the measured worst case over the four page-coloured accents and all
 * twelve palettes, which is 1.67 on the darkest light surface. Reading the raw
 * accent instead puts the same case at 1.00, identical to the page, which is
 * the defect this pins. The hover state carries the real target separately.
 */
const UNDERLINE_REST_FLOOR = 1.6;

const VARIABLES_BLOCKS = blocks('variables.css');

/**
 * One palette as it actually resolves on <html>: the block's own declarations
 * over the derived tokens variables.css declares for the matching mode.
 *
 * A template block declares --theme-accent but never --theme-accent-text, so
 * anything reading the corrected token has to be resolved against both. `mode`
 * comes from the block's page rather than its selector, because developer's
 * unqualified block is its DARK palette.
 *
 * `overrides` is how a configured accent is simulated: applyConfigDom writes
 * the accent and both corrected variants as inline properties on <html>, which
 * beat every block, so setting them here is the same substitution the browser
 * would perform.
 */
function rendered(block: Block, overrides: string[][] = []): Block {
  const mode = relativeLuminance(page(block)) >= 0.5 ? 'light' : 'dark';
  const base = VARIABLES_BLOCKS.find((candidate) =>
    mode === 'dark'
      ? candidate.selector.includes('[data-theme="dark"]')
      : candidate.selector.startsWith(':root'),
  );
  const merged = new Map(base?.declarations ?? []);
  for (const [key, value] of block.declarations) merged.set(key, value);
  for (const [key, value] of overrides) merged.set(key, value);
  return { ...block, declarations: merged };
}

/**
 * The inline properties applyConfigDom writes for a configured accent.
 * Mirrors resolveAccent rather than restating its numbers.
 */
function configured(hex: string): string[][] {
  return [
    ['--theme-accent', hex],
    ['--theme-accent-text-light', accentTextForMode(hex, 'light') ?? ''],
    ['--theme-accent-text-dark', accentTextForMode(hex, 'dark') ?? ''],
  ];
}

const COMPONENT_BLOCKS = parseBlocks(
  readFileSync(COMPONENTS, 'utf8'),
  'components.css',
);

function componentRule(selector: string): Block {
  const found = COMPONENT_BLOCKS.find((block) => block.selector === selector);
  if (!found) throw new Error(`components.css has no ${selector} rule`);
  return found;
}

/** The colour at the end of a `box-shadow` or `outline` shorthand. */
function trailingColour(value: string): string {
  const match =
    /(var\((?:[^()]|\([^()]*\))*\)|color-mix\((?:[^()]|\([^()]*\))*\)|rgba?\([^()]*\)|#[0-9a-f]{3,8}|[a-z]+)\s*$/i.exec(
      value.trim(),
    );
  if (!match) throw new Error(`no trailing colour in "${value}"`);
  return match[1];
}

describe('the ink that goes on the accent', () => {
  it('is declared by every block that declares an accent', () => {
    // Whichever block wins the cascade for the fill wins for the ink, so the
    // two can never come from different palettes. Twelve blocks, no exceptions.
    const missing = accentBlocks
      .filter((block) => !block.declarations.has('--theme-accent-contrast'))
      .map(label);

    expect(missing).toEqual([]);
  });

  it('clears 4.5:1 on the fill it is placed on', () => {
    const failures: string[] = [];

    for (const block of accentBlocks) {
      const fill = accentFill(block);
      const ink = onPage(
        block.declarations.get('--theme-accent-contrast') ?? '',
        block,
      );
      if (!ink) {
        failures.push(`${label(block)}: unresolvable ink`);
        continue;
      }
      const ratio = contrastRatio(fill, ink);
      if (ratio < ACCENT_CONTRAST_TARGET) {
        failures.push(`${label(block)}: ${ratio.toFixed(2)}:1`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('has a shade on the opposite side, so the hover moves away from it', () => {
    // --theme-accent-shade is the direction --theme-accent-hover walks the fill,
    // and its only consumer is that inline formula. The CSS pair is the
    // no-accent-configured fallback, declared per mode, and the rule it has to
    // satisfy is "away from the ink" rather than "the mode's own shade". For
    // these twelve the two coincide, which is exactly the sort of coincidence
    // that hides a bug, so it is computed from the ink here rather than assumed
    // from the selector.
    const wrong: string[] = [];

    for (const block of accentBlocks) {
      const view = rendered(block);
      const ink = resolveColour(
        block.declarations.get('--theme-accent-contrast') ?? '',
        view,
      );
      const shade = resolveColour(
        view.declarations.get('--theme-accent-shade') ?? '',
        view,
      );
      if (!ink || !shade) {
        wrong.push(`${label(block)}: unresolvable`);
        continue;
      }
      if (relativeLuminance(ink.rgb) > 0.5 === relativeLuminance(shade.rgb) > 0.5)
        wrong.push(
          `${label(block)}: ink and shade on the same side of the range`,
        );
    }

    expect(wrong).toEqual([]);
  });

  it('is the ink the module would have chosen for the same fill', () => {
    // An owner who configures an accent gets this value written inline on
    // <html> by applyConfigDom; an owner who configures nothing gets it from
    // the block. If the two disagreed, the same fill would carry two different
    // labels depending on a config key, and only one of them would be checked.
    const disagreements: string[] = [];

    for (const block of accentBlocks) {
      const fill = accentFill(block);
      const rounded = formatHexColor([
        Math.round(fill[0]),
        Math.round(fill[1]),
        Math.round(fill[2]),
      ]);
      const expected = accentContrastColor(rounded);
      const declared = block.declarations.get('--theme-accent-contrast');
      const declaredRgb = declared ? resolveColour(declared, block) : null;
      const expectedRgb = expected ? parseHexColor(expected) : null;
      if (!declaredRgb || !expectedRgb || !near(declaredRgb.rgb, expectedRgb)) {
        disagreements.push(`${label(block)}: ${declared} vs ${expected}`);
      }
    }

    expect(disagreements).toEqual([]);
  });
});

describe('article link underlines', () => {
  it('are stated by every block that declares an accent', () => {
    // Both blocks of a template match <html>, and the more specific one only
    // outranks the other for what it declares. A pair declared once as a
    // literal was therefore the OTHER mode's underline too: minimal's dark page
    // underlined in the light accent and developer's light page in the dark one.
    const missing: string[] = [];
    for (const block of accentBlocks) {
      for (const property of [
        '--theme-link-decoration-color',
        '--theme-link-decoration-hover',
      ]) {
        if (!block.declarations.has(property))
          missing.push(`${label(block)}: ${property}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('resolve on hover to the accent of the block they belong to', () => {
    const wrong: string[] = [];

    for (const block of accentBlocks) {
      const view = rendered(block);
      const hover = onPage(
        block.declarations.get('--theme-link-decoration-hover') ?? '',
        view,
      );
      if (!hover || !near(hover, accentFill(block))) {
        wrong.push(`${label(block)}: ${hover?.map(Math.round).join(',')}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('resolve at rest to a tint of that same accent, not to a colour of their own', () => {
    // This is what a hardcoded #c5c0b8 fails and what a re-spelled accent
    // passes, so it is a statement about the pixel rather than about the token.
    const wrong: string[] = [];

    for (const block of accentBlocks) {
      const resting = onPage(
        block.declarations.get('--theme-link-decoration-color') ?? '',
        rendered(block),
      );
      const tint = composite(
        { rgb: accentFill(block), alpha: 1 },
        page(block),
        0.4,
      );
      if (!resting || !near(resting, tint)) {
        wrong.push(`${label(block)}: ${resting?.map(Math.round).join(',')}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('are quiet at rest and reach 3:1 under the pointer', () => {
    // The resting underline is deliberately faint: it is a decoration under
    // text that carries its own contrast. The hover state is the feedback, and
    // it is the one that has to be seen.
    const failures: string[] = [];

    for (const block of accentBlocks) {
      const resting = onPage(
        block.declarations.get('--theme-link-decoration-color') ?? '',
        block,
      );
      const view = rendered(block);
      const hover = onPage(
        block.declarations.get('--theme-link-decoration-hover') ?? '',
        view,
      );
      if (!resting || !hover) {
        failures.push(`${label(block)}: unresolvable`);
        continue;
      }
      const restingRatio = contrastRatio(resting, page(block));
      const hoverRatio = contrastRatio(hover, page(block));
      if (hoverRatio < INDICATOR_TARGET) {
        failures.push(`${label(block)}: hover ${hoverRatio.toFixed(2)}:1`);
      }
      if (restingRatio > hoverRatio) {
        failures.push(
          `${label(block)}: rest ${restingRatio.toFixed(2)} louder than hover ${hoverRatio.toFixed(2)}`,
        );
      }
      if (restingRatio <= 1.05) {
        failures.push(`${label(block)}: rest invisible`);
      }
    }

    expect(failures).toEqual([]);
  });
  it('survive a configured accent that is the page colour, in both states', () => {
    // The underline is the only thing telling a reader that a run of prose is a
    // link: .markdown-body a takes its COLOUR from --theme-text-primary, so
    // there is no second cue. A raw accent is whatever the owner typed, so a
    // white accent on a light page gave a white underline and a white hover,
    // and both vanished together. Reading the corrected accent bounds how faint
    // either state can get, because that token clears 4.5:1 against the worst
    // surface of its mode before it is tinted.
    const failures: string[] = [];

    for (const owner of ['#ffffff', '#000000', '#f8fafc', '#0d1117']) {
      for (const block of accentBlocks) {
        const view = rendered(block, configured(owner));
        const resting = onPage(
          block.declarations.get('--theme-link-decoration-color') ?? '',
          view,
        );
        const hover = onPage(
          block.declarations.get('--theme-link-decoration-hover') ?? '',
          view,
        );
        if (!resting || !hover) {
          failures.push(`${owner} ${label(block)}: unresolvable`);
          continue;
        }
        const restingRatio = contrastRatio(resting, page(block));
        const hoverRatio = contrastRatio(hover, page(block));
        // The hover is the interactive feedback and is held to the state
        // indicator target. The resting state is a decoration under text that
        // carries its own contrast, so it only has to remain a visible mark.
        if (hoverRatio < INDICATOR_TARGET)
          failures.push(
            `${owner} ${label(block)}: hover ${hoverRatio.toFixed(2)}:1`,
          );
        if (restingRatio < UNDERLINE_REST_FLOOR)
          failures.push(
            `${owner} ${label(block)}: rest ${restingRatio.toFixed(2)}:1`,
          );
      }
    }

    expect(failures).toEqual([]);
  });
});

describe('the primary button', () => {
  const rest = componentRule('.btn-theme-primary');
  const hover = componentRule('.btn-theme-primary:hover:not(:disabled)');
  const focus = componentRule('.btn-theme-primary:focus-visible');

  it('fills with the accent of whichever block wins', () => {
    const wrong: string[] = [];
    for (const block of accentBlocks) {
      const fill = resolveColour(
        rest.declarations.get('background-color') ?? '',
        block,
      );
      if (!fill || !near(composite(fill, page(block)), accentFill(block))) {
        wrong.push(label(block));
      }
    }
    expect(wrong).toEqual([]);
  });

  it('keeps its label readable at rest and under the pointer, in every palette', () => {
    // Under the pointer as well as at rest, because a hover colour that moves
    // toward the label rather than away from it is only unreadable once someone
    // hovers: developer's light hover was #7287fd, which left white text at
    // 3.18:1 while every other palette sat between 7.10:1 and 21:1.
    //
    // SCOPE, so this is not mistaken for more than it proves: the twelve
    // palettes, which is every instance, and NOT a configured accent. For a
    // configured accent --theme-accent-hover is
    // color-mix(in oklab, accent 85%, --theme-accent-shade), and the shade is
    // picked by the MODE while the ink is picked by the accent's own
    // luminance. When they agree the hover moves toward the ink: over a 4096
    // colour sweep, 39% of accents drop below 4.5:1 on the hovered button in
    // at least one mode, worst 3.08, and even the default #0969da falls to
    // 3.86 in dark mode. Re-picking the ink against the hovered fill does not
    // fix it either (1261 of 4096 still fail, worst 3.35): the hover fill has
    // to stop crossing the ink, which needs a token that says "away from the
    // ink" rather than "toward the mode's shade". That is a change to the
    // property applyConfigDom writes, so it is not made here, and asserting
    // the configured case would only make this test red rather than make the
    // button safe.
    const failures: string[] = [];

    for (const block of accentBlocks) {
      const ink = resolveColour(rest.declarations.get('color') ?? '', block);
      const restFill = resolveColour(
        rest.declarations.get('background-color') ?? '',
        block,
      );
      const hoverFill = resolveColour(
        hover.declarations.get('background-color') ?? '',
        block,
      );
      if (!ink || !restFill || !hoverFill) {
        failures.push(`${label(block)}: unresolvable`);
        continue;
      }
      const inkOn = (fill: Colour) =>
        contrastRatio(
          composite(ink, composite(fill, page(block))),
          composite(fill, page(block)),
        );
      const atRest = inkOn(restFill);
      const onHover = inkOn(hoverFill);
      if (atRest < ACCENT_CONTRAST_TARGET)
        failures.push(`${label(block)}: rest ${atRest.toFixed(2)}:1`);
      if (onHover < ACCENT_CONTRAST_TARGET)
        failures.push(`${label(block)}: hover ${onHover.toFixed(2)}:1`);
    }

    expect(failures).toEqual([]);
  });

  it('falls back to a literal colour for its label, never to the inherited one', () => {
    // `color` inherits, so a var() with no fallback that is invalid at
    // computed-value time resolves to the page text colour: near-black label
    // text on a dark accent fill. The fallback caps the damage of a block that
    // ever loses the token at white-on-accent.
    const value = rest.declarations.get('color') ?? '';
    const fallback = /^var\(\s*--[a-z0-9-]+\s*,([\s\S]+)\)$/i.exec(
      value.trim(),
    );

    expect(fallback).not.toBeNull();
    expect(parseColor(fallback?.[1] ?? '')).not.toBeNull();
  });

  it('offsets its focus outline so the ring lands on the page', () => {
    // Without the offset the ring would sit on a fill of its own colour and
    // disappear. Its contrast is measured with the other indicators below.
    expect(focus.declarations.get('outline-offset')).toBeTruthy();
  });
});

describe('state indicators drawn from the accent', () => {
  /**
   * Every indicator the accent now draws, read from the file that decides it
   * rather than restated here. The Tailwind namespaces cover the classes:
   * `border-theme-accent` marks the active feed tab and the selected tipping
   * currency, `ring-theme-accent` is on five focus rings.
   */
  const tokenSource = readFileSync(TOKENS, 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const namespace = declarations(
    tokenSource.slice(
      tokenSource.indexOf('{') + 1,
      tokenSource.lastIndexOf('}'),
    ),
  );
  // A narrower namespace wins over --color-* for the utility it names, which is
  // how text-theme-accent already differs from bg-theme-accent.
  const namespaceSource = (utility: 'border' | 'ring') =>
    namespace.get(`--${utility}-color-theme-accent`) ??
    namespace.get('--color-theme-accent') ??
    '';

  const INDICATORS: Array<[string, string]> = [
    [
      'the text input focus ring',
      trailingColour(
        componentRule('.input-theme:focus').declarations.get('box-shadow') ??
          '',
      ),
    ],
    [
      'the primary button focus outline',
      trailingColour(
        componentRule('.btn-theme-primary:focus-visible').declarations.get(
          'outline',
        ) ?? '',
      ),
    ],
    ['border-theme-accent', namespaceSource('border')],
    ['ring-theme-accent', namespaceSource('ring')],
  ];

  it('are all present and none carries a colour of its own', () => {
    // The input ring was rgba(59, 130, 246, 0.3): a fixed blue no template
    // asked for, at 1.19:1 on the default light page.
    for (const [name, source] of INDICATORS) {
      expect(source, name).not.toBe('');
      expect(parseColor(source), name).toBeNull();
    }
  });

  it('clear 3:1 against every page, with no accent configured', () => {
    // 40% of the accent, which is what the underline uses and what the spec
    // proposed for the ring, measures 1.74:1 to 3.42:1 and fails eleven of
    // twelve. This assertion is the reason the ring is at full strength.
    const failures: string[] = [];

    for (const [name, source] of INDICATORS) {
      for (const block of accentBlocks) {
        const view = rendered(block);
        const colour = resolveColour(source, view);
        if (!colour) {
          failures.push(`${name} ${label(block)}: unresolvable`);
          continue;
        }
        const ratio = contrastRatio(
          composite(colour, page(block)),
          page(block),
        );
        if (ratio < INDICATOR_TARGET)
          failures.push(`${name} ${label(block)}: ${ratio.toFixed(2)}:1`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('clear 3:1 for a configured accent that is the page colour', () => {
    // The hole this closes: --theme-accent is a FILL token and is allowed to be
    // exactly what the owner typed, because the label on the fill is corrected
    // against it. An indicator has nothing on top of it and sits on the page,
    // so a white accent in light mode drew a white ring on a white page while
    // `outline: none` removed the only other thing to see. Both extremes are
    // swept, in both modes, because a palette's mode decides which correction
    // variant applies.
    const failures: string[] = [];

    for (const owner of ['#ffffff', '#000000', '#f8fafc', '#0d1117']) {
      for (const [name, source] of INDICATORS) {
        for (const block of accentBlocks) {
          const view = rendered(block, configured(owner));
          const colour = resolveColour(source, view);
          if (!colour) {
            failures.push(`${owner} ${name} ${label(block)}: unresolvable`);
            continue;
          }
          const ratio = contrastRatio(
            composite(colour, page(block)),
            page(block),
          );
          if (ratio < INDICATOR_TARGET)
            failures.push(
              `${owner} ${name} ${label(block)}: ${ratio.toFixed(2)}:1`,
            );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('replace a token that failed 3:1 in every palette', () => {
    // The active tab used to be border-theme-strong. Computing its ratio here
    // rather than quoting it means swapping the token back fails, and means the
    // improvement is not a coincidence of one palette.
    const strongFailures: string[] = [];

    for (const block of accentBlocks) {
      const strong = onPage('var(--theme-border-strong)', block);
      if (strong && contrastRatio(strong, page(block)) < INDICATOR_TARGET) {
        strongFailures.push(label(block));
      }
    }

    expect(strongFailures.length).toBe(accentBlocks.length);
  });

  it('leave the raw accent to the fills, which is where it belongs', () => {
    // bg-theme-accent must NOT be corrected: the button fill is the colour the
    // owner asked for, and its label is chosen against that exact colour.
    const fillSource =
      namespace.get('--background-color-theme-accent') ??
      namespace.get('--color-theme-accent') ??
      '';

    const wrong: string[] = [];
    for (const block of accentBlocks) {
      const view = rendered(block, configured('#ffff00'));
      const colour = resolveColour(fillSource, view);
      const yellow = parseHexColor('#ffff00') as Rgb;
      if (!colour || !near(composite(colour, page(block)), yellow))
        wrong.push(label(block));
    }

    expect(wrong).toEqual([]);
  });
});

describe('author and tag chips inside an article', () => {
  const markdown = parseBlocks(
    readFileSync(join(HERE, 'blog-markdown.css'), 'utf8'),
    'blog-markdown.css',
  );

  const chips = markdown.filter((block) =>
    /\.er-(author|tag)-link$/.test(block.selector),
  );

  /** One palette as it resolves on <html>, with the chip rule layered on top. */
  function chipView(block: Block, chip: Block, overrides: string[][]): Block {
    const view = rendered(block, overrides);
    const merged = new Map(view.declarations);
    for (const [key, value] of chip.declarations) merged.set(key, value);
    return {
      ...view,
      selector: `${block.selector} ${chip.selector}`,
      declarations: merged,
    };
  }

  it('render the template accent unchanged when no accent is configured', () => {
    // 27 of 27 instances. --theme-accent-text falls through to the accent, so
    // this pins that reading the corrected token cost nobody a pixel.
    expect(chips.length).toBe(2);
    const wrong: string[] = [];

    for (const chip of chips) {
      for (const block of accentBlocks) {
        const view = chipView(block, chip, []);
        const colour = resolveColour(
          chip.declarations.get('color') ?? '',
          view,
        );
        if (!colour || !near(composite(colour, page(block)), accentFill(block)))
          wrong.push(view.selector);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('correct an owner accent that would be illegible as text', () => {
    // Yellow is the case the whole correction exists for: 1.07:1 as text on a
    // white page. applyConfigDom writes the accent AND both corrected variants
    // inline on <html>, so a chip reading the raw token would render the yellow
    // and a chip reading the corrected one renders the olive.
    const OWNER_ACCENT = '#ffff00';
    const failures: string[] = [];

    for (const chip of chips) {
      for (const block of accentBlocks) {
        const view = chipView(block, chip, configured(OWNER_ACCENT));
        const colour = resolveColour(
          chip.declarations.get('color') ?? '',
          view,
        );
        if (!colour) {
          failures.push(`${view.selector}: unresolvable`);
          continue;
        }
        const ratio = contrastRatio(
          composite(colour, page(block)),
          page(block),
        );
        if (ratio < ACCENT_CONTRAST_TARGET)
          failures.push(`${view.selector}: ${ratio.toFixed(2)}:1`);
      }
    }

    expect(failures).toEqual([]);
  });
});
