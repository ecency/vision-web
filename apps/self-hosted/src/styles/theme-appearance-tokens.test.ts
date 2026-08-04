import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCENT_CONTRAST_TARGET,
  ACCENT_TINT_PERCENT,
  contrastRatio,
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

/** Top-level `selector { ... }` blocks of a stylesheet, comments removed. */
function blocks(file: string): Block[] {
  const css = readFileSync(join(THEMES, file), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
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
      if (!selector.startsWith('@')) {
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
