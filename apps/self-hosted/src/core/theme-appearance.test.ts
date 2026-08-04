import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCENT_CONTRAST_TARGET,
  ACCENT_TINT_PERCENT,
  ACCENT_HOVER,
  accentContrastColor,
  accentShadeFor,
  accentTextFor,
  accentTextForMode,
  contrastRatio,
  DARK_WORST_SURFACE,
  FONT_PRESET_OPTIONS,
  FONT_PRESETS,
  formatHexColor,
  LIGHT_WORST_SURFACE,
  parseHexColor,
  type Rgb,
  relativeLuminance,
  resolveAccent,
  resolveFontPreset,
  tintedSurface,
} from './theme-appearance';

/**
 * The accent knob's promise is that an owner cannot produce an unreadable site
 * from a valid colour. That is a claim about all 16.7 million of them, so it is
 * checked by sweeping rather than by naming a few, and the surfaces it is swept
 * against are read out of the theme files rather than copied into this file: a
 * template added with a lighter dark surface has to fail here instead of
 * shipping a sub-AA link to a paying instance.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = resolve(HERE, '..', 'styles');
const THEMES = join(STYLES, 'themes');

/** Every `--theme-bg-primary` the templates declare, split by mode. */
function declaredSurfaces(): { light: string[]; dark: string[] } {
  const light = new Set<string>();
  const dark = new Set<string>();

  for (const file of readdirSync(THEMES)) {
    if (!file.endsWith('.css')) continue;
    const css = readFileSync(join(THEMES, file), 'utf8');
    for (const match of css.matchAll(/--theme-bg-primary:\s*([^;]+);/g)) {
      const value = match[1].trim();
      const parsed = parseHexColor(value);
      if (!parsed) continue;
      (relativeLuminance(parsed) >= 0.5 ? light : dark).add(
        value.toLowerCase(),
      );
    }
  }

  return { light: [...light], dark: [...dark] };
}

const SURFACES = declaredSurfaces();

/** Every 17th value per channel: 16^3 = 4096 colours. */
function sweep(): string[] {
  const steps = Array.from({ length: 16 }, (_, index) => index * 17);
  const out: string[] = [];
  for (const r of steps)
    for (const g of steps)
      for (const b of steps) out.push(formatHexColor([r, g, b]));
  return out;
}

const COLOURS = sweep();

function worstRatio(pairs: Array<{ text: string; surface: string }>): {
  ratio: number;
  text: string;
  surface: string;
} {
  let worst = { ratio: Number.POSITIVE_INFINITY, text: '', surface: '' };
  for (const { text, surface } of pairs) {
    const ratio = contrastRatio(
      parseHexColor(text) as Rgb,
      parseHexColor(surface) as Rgb,
    );
    if (ratio < worst.ratio) worst = { ratio, text, surface };
  }
  return worst;
}

describe('declared surfaces', () => {
  it('reads a surface out of every theme file', () => {
    // Six templates' worth of light and dark palettes. A regex that stopped
    // matching would otherwise make every sweep below pass vacuously.
    expect(SURFACES.light.length).toBeGreaterThanOrEqual(3);
    expect(SURFACES.dark.length).toBeGreaterThanOrEqual(5);
  });

  it('corrects against the hardest surface of each mode', () => {
    // Dark text is hardest to read on the darkest light surface, and light text
    // on the lightest dark one.
    const darkestLight = [...SURFACES.light].sort(
      (a, b) =>
        relativeLuminance(parseHexColor(a) as Rgb) -
        relativeLuminance(parseHexColor(b) as Rgb),
    )[0];
    const lightestDark = [...SURFACES.dark].sort(
      (a, b) =>
        relativeLuminance(parseHexColor(b) as Rgb) -
        relativeLuminance(parseHexColor(a) as Rgb),
    )[0];

    expect(darkestLight).toBe(LIGHT_WORST_SURFACE);
    expect(lightestDark).toBe(DARK_WORST_SURFACE);
  });
});

describe('accentTextFor', () => {
  it('clears 4.5:1 on every declared surface, over an exhaustive sweep', () => {
    const failures: string[] = [];
    const pairs: Array<{ text: string; surface: string }> = [];

    for (const colour of COLOURS) {
      for (const surface of [...SURFACES.light, ...SURFACES.dark]) {
        const text = accentTextFor(colour, surface);
        if (!text) {
          failures.push(`${colour} on ${surface}: no correction`);
          continue;
        }
        pairs.push({ text, surface });
      }
    }

    const worst = worstRatio(pairs);
    expect(failures).toEqual([]);
    expect(pairs.length).toBe(
      COLOURS.length * (SURFACES.light.length + SURFACES.dark.length),
    );
    // The walk stops at the first lightness that clears, so the worst case
    // sitting just above the target is the evidence that it is the target doing
    // the work rather than the colours happening to be easy.
    expect(worst.ratio).toBeGreaterThanOrEqual(ACCENT_CONTRAST_TARGET);
    expect(worst.ratio).toBeLessThan(ACCENT_CONTRAST_TARGET + 0.05);
  });
});

describe('accentTextForMode', () => {
  it('stays readable on the page and on the tag chip it tints', () => {
    // The chip is the page surface with ACCENT_TINT_PERCENT of the accent mixed
    // in, which moves the background toward the text. Correcting against the
    // page alone would leave the chips below the target: the worst case of the
    // single-surface correction is exactly the target, so any tint at all
    // pushes it under.
    const failures: string[] = [];

    for (const colour of COLOURS) {
      const accent = parseHexColor(colour) as Rgb;
      for (const mode of ['light', 'dark'] as const) {
        const text = accentTextForMode(colour, mode);
        if (!text) {
          failures.push(`${colour} ${mode}: no correction`);
          continue;
        }
        const parsed = parseHexColor(text) as Rgb;
        for (const surface of SURFACES[mode]) {
          const background = parseHexColor(surface) as Rgb;
          const chip = tintedSurface(accent, background);
          for (const [what, against] of [
            ['page', background],
            ['chip', chip],
          ] as const) {
            const ratio = contrastRatio(parsed, against);
            if (ratio < ACCENT_CONTRAST_TARGET) {
              failures.push(
                `${colour} ${mode} on ${surface} ${what}: ${ratio.toFixed(3)}`,
              );
            }
          }
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([]);
  });

  it('leaves a colour that is already readable alone', () => {
    // The correction must not repaint an accent that needs no help, or every
    // owner gets a colour they did not pick.
    expect(accentTextForMode('#8b4513', 'light')).toBe('#8b4513');
    expect(accentTextForMode('#ffff00', 'light')).not.toBe('#ffff00');
    expect(accentTextForMode('#ffff00', 'dark')).toBe('#ffff00');
  });
});

describe('accentContrastColor', () => {
  it('clears 4.5:1 on the fill, over an exhaustive sweep', () => {
    const worst = worstRatio(
      COLOURS.map((colour) => ({
        text: accentContrastColor(colour) as string,
        surface: colour,
      })),
    );

    expect(worst.ratio).toBeGreaterThanOrEqual(ACCENT_CONTRAST_TARGET);
  });
});

describe('accentShadeFor and the hovered fill', () => {
  /**
   * `color-mix(in oklab, a p%, b)`, which is what ACCENT_HOVER asks the browser
   * for. Modelled here rather than approximated in sRGB, because the whole
   * claim is about where the hovered fill lands relative to its own ink and an
   * approximation would be measuring a different colour than the one shipped.
   */
  function mixOklab(a: Rgb, b: Rgb, share: number): Rgb {
    const toLinear = (channel: number) => {
      const c = channel / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const toSrgb = (channel: number) => {
      const v =
        channel <= 0.0031308
          ? channel * 12.92
          : 1.055 * channel ** (1 / 2.4) - 0.055;
      return Math.min(255, Math.max(0, Math.round(v * 255)));
    };
    const forward = (rgb: Rgb): [number, number, number] => {
      const [R, G, B] = rgb.map(toLinear);
      const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
      const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
      const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
      return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
      ];
    };
    const back = ([L, A, B]: [number, number, number]): Rgb => {
      const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
      const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
      const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
      return [
        toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
      ];
    };
    const A = forward(a);
    const B = forward(b);
    return back([0, 1, 2].map((i) => A[i] * share + B[i] * (1 - share)) as [
      number,
      number,
      number,
    ]);
  }

  /** The share ACCENT_HOVER keeps of the accent, read from the constant. */
  const HOVER_SHARE =
    Number(/var\(--theme-accent\)\s+(\d+)%/.exec(ACCENT_HOVER)?.[1]) / 100;

  it('mixes the accent with the shade, at a share the constant states', () => {
    // Everything below measures the colour this produces, so a change to the
    // constant that these assertions could not see would make them vacuous.
    expect(ACCENT_HOVER).toContain('in oklab');
    expect(ACCENT_HOVER).toContain('var(--theme-accent-shade)');
    expect(HOVER_SHARE).toBeGreaterThan(0);
    expect(HOVER_SHARE).toBeLessThan(1);
  });

  it('points away from the ink rather than towards the mode', () => {
    const wrong: string[] = [];
    for (const colour of COLOURS) {
      const ink = accentContrastColor(colour) as string;
      const shade = accentShadeFor(ink) as string;
      const inkLuminance = relativeLuminance(parseHexColor(ink) as Rgb);
      const shadeLuminance = relativeLuminance(parseHexColor(shade) as Rgb);
      // Opposite ends of the range: a light ink must take a dark shade.
      if (inkLuminance > 0.5 === shadeLuminance > 0.5)
        wrong.push(`${colour}: ink ${ink} with shade ${shade}`);
    }
    expect(wrong).toEqual([]);
  });

  it('leaves the label readable while hovered, over an exhaustive sweep', () => {
    // The defect this closes: the shade used to be picked by the MODE while the
    // ink is picked by the accent's own luminance, so when they agreed the
    // hover walked the fill towards its own label. 39% of these colours fell
    // below 4.5:1 hovered, worst 3.08, and #0969da reached 3.86 in dark mode.
    let worst = Number.POSITIVE_INFINITY;
    let worstColour = '';

    for (const colour of COLOURS) {
      const accent = parseHexColor(colour) as Rgb;
      const ink = accentContrastColor(colour) as string;
      const shade = accentShadeFor(ink) as string;
      const hovered = mixOklab(
        accent,
        parseHexColor(shade) as Rgb,
        HOVER_SHARE,
      );
      const ratio = contrastRatio(hovered, parseHexColor(ink) as Rgb);
      if (ratio < worst) {
        worst = ratio;
        worstColour = colour;
      }
    }

    expect(
      worst,
      `worst hovered label contrast ${worst.toFixed(3)}:1 on ${worstColour}`,
    ).toBeGreaterThanOrEqual(ACCENT_CONTRAST_TARGET);
  });

  it('never makes the label worse than it is at rest', () => {
    // The property that makes the assertion above hold for colours outside the
    // sweep too: moving a fill away from its ink can only raise the ratio, and
    // accentContrastColor already clears the target at rest.
    const regressions: string[] = [];

    for (const colour of COLOURS) {
      const accent = parseHexColor(colour) as Rgb;
      const ink = accentContrastColor(colour) as string;
      const inkRgb = parseHexColor(ink) as Rgb;
      const hovered = mixOklab(
        accent,
        parseHexColor(accentShadeFor(ink) as string) as Rgb,
        HOVER_SHARE,
      );
      const atRest = contrastRatio(accent, inkRgb);
      const onHover = contrastRatio(hovered, inkRgb);
      if (onHover < atRest - 0.001)
        regressions.push(
          `${colour}: ${atRest.toFixed(2)} to ${onHover.toFixed(2)}`,
        );
    }

    expect(regressions).toEqual([]);
  });
});

describe('parseHexColor', () => {
  it('accepts the two shorthands and nothing else', () => {
    expect(parseHexColor('#abc')).toEqual([0xaa, 0xbb, 0xcc]);
    expect(parseHexColor('#AABBCC')).toEqual([0xaa, 0xbb, 0xcc]);
    expect(parseHexColor('  #8b4513  ')).toEqual([0x8b, 0x45, 0x13]);
  });

  it('refuses everything a custom property would swallow', () => {
    // A custom property parses any token sequence and only fails at
    // substitution, so an unvalidated value would make every
    // `background-color: var(--theme-accent)` invalid at computed-value time
    // and render those surfaces transparent rather than falling back.
    for (const value of [
      '',
      '   ',
      'banana',
      'rgb(0, 0, 0)',
      'rgba(300, 0, 0, 1)',
      'var(--x)',
      '#12345',
      '#8b4513ff',
      '#',
      'red',
      123,
      null,
      undefined,
      {},
      [],
      ['#ffffff'],
    ]) {
      expect(`${JSON.stringify(value)}: ${parseHexColor(value)}`).toBe(
        `${JSON.stringify(value)}: null`,
      );
    }
  });
});

describe('resolveAccent', () => {
  it('derives every value from the one colour', () => {
    const resolved = resolveAccent('#8B4513');

    expect(resolved).not.toBeNull();
    expect(resolved?.accent).toBe('#8b4513');
    expect(resolved?.contrast).toBe('#ffffff');
    expect(resolved?.textLight).toBe('#8b4513');
    expect(resolved?.textDark).not.toBe('#8b4513');
    // The hover is a constant string so it re-substitutes on a mode change
    // rather than going stale: nothing recomputes it when data-theme flips.
    expect(resolved?.hover).toContain('var(--theme-accent-shade)');
    expect(resolved?.hover).toContain('var(--theme-accent)');
  });

  it('is null for absence and for every unusable value', () => {
    for (const value of [
      '',
      '  ',
      'banana',
      '#12345',
      123,
      null,
      undefined,
      {},
    ]) {
      expect(resolveAccent(value)).toBeNull();
    }
  });
});

describe('font presets', () => {
  const fontsCss = readFileSync(join(STYLES, 'fonts.css'), 'utf8');

  /** The families fonts.css actually downloads, from its Google Fonts URLs. */
  const loaded = new Set(
    [...fontsCss.matchAll(/family=([^:&"]+)/g)].map((match) =>
      match[1].replace(/\+/g, ' '),
    ),
  );

  const GENERIC = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
  ]);

  /** Faces the operating system ships. None of these is a download. */
  const INSTALLED = new Set([
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'Arial',
    'Helvetica Neue',
    'Georgia',
    'Times New Roman',
    'SFMono-Regular',
    'Menlo',
    'Consolas',
  ]);

  function families(stack: string): string[] {
    return stack.split(',').map((part) => part.trim().replace(/^"|"$/g, ''));
  }

  it('reads the families fonts.css loads', () => {
    expect([...loaded].sort()).toEqual([
      'Inter',
      'JetBrains Mono',
      'Playfair Display',
      'Source Serif 4',
    ]);
  });

  it('names no family that nothing loads and nothing ships', () => {
    // A preset naming an unloaded family renders a silent fallback, which is
    // the dead-surface pattern the whole appearance track exists to end.
    const unknown: string[] = [];
    for (const [key, preset] of Object.entries(FONT_PRESETS)) {
      for (const face of ['body', 'heading', 'ui'] as const) {
        for (const family of families(preset[face])) {
          if (
            loaded.has(family) ||
            GENERIC.has(family) ||
            INSTALLED.has(family)
          )
            continue;
          unknown.push(`${key}.${face}: ${family}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('sets all three faces in every preset', () => {
    // --theme-font-ui alone has 29 call sites through font-theme-ui; a preset
    // that changed body and heading only would read as a bug.
    for (const preset of Object.values(FONT_PRESETS)) {
      expect(preset.body.length).toBeGreaterThan(0);
      expect(preset.heading.length).toBeGreaterThan(0);
      expect(preset.ui.length).toBeGreaterThan(0);
    }
  });

  it('offers exactly the presets it can resolve, plus an explicit unset', () => {
    // The select renderer falls back to '' for an unconfigured field, so
    // without an option carrying that value the panel would show the first
    // preset as selected while the config held nothing, and there would be no
    // way back to the template's own faces.
    const values = FONT_PRESET_OPTIONS.map((option) => option.value);
    expect(values).toContain('');
    expect(values.filter((value) => value !== '').sort()).toEqual(
      Object.keys(FONT_PRESETS).sort(),
    );
    expect(new Set(values).size).toBe(values.length);
  });

  it('resolves a key and refuses anything else', () => {
    expect(resolveFontPreset('classic')).toBe(FONT_PRESETS.classic);
    expect(resolveFontPreset(' Classic ')).toBe(FONT_PRESETS.classic);
    for (const value of ['', '  ', 'comic-sans', 'toString', 123, null, {}]) {
      expect(resolveFontPreset(value)).toBeNull();
    }
  });
});

describe('the tint the chips use', () => {
  it('is the mix declared in variables.css', () => {
    // The correction has to know the surface the corrected text lands on. If
    // the stylesheet's mix and this constant drift apart, the sweep above is
    // proving a chip nobody renders.
    const css = readFileSync(join(THEMES, 'variables.css'), 'utf8');
    // Transparent-first, so the build's pre-color-mix fallback is an unfilled
    // chip rather than one filled with the accent at full strength. The share
    // of the accent is therefore what is left over.
    const declarations = [
      ...css.matchAll(
        /--theme-tag-bg:\s*color-mix\(in srgb, transparent (\d+)%, var\(--theme-accent\)\)/g,
      ),
    ];

    expect(declarations.length).toBe(2);
    for (const declaration of declarations) {
      expect(100 - Number(declaration[1])).toBe(ACCENT_TINT_PERCENT);
    }
  });
});
