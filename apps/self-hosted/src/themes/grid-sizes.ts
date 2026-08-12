/**
 * A `sizes` attribute matching the theme's OWN grid. The column counts live
 * in the --theme-grid-columns-* custom properties that components.css
 * consumes behind 768px and 1024px media queries, so the image hint reads
 * that same source: a hard-coded three-column assumption had browsers
 * fetching undersized images on the one-column Reader and Journal grids and
 * the two-column Minimal and Developer grids.
 *
 * The parameter only keys memoization; the values come from computed style
 * on the document root, where apply-config-dom stamps data-style-template.
 * By the time a render reads this the attribute reflects the template being
 * rendered: boot applies the DOM declaration before mounting, and preview
 * applies it before React flushes the store update.
 */
export function computeThemeGridSizes(_styleTemplate: unknown): string {
  const columnsOf = (name: string, fallback: number): number => {
    if (typeof document === 'undefined') return fallback;
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const tablet = columnsOf('--theme-grid-columns-tablet', 2);
  const desktop = columnsOf('--theme-grid-columns-desktop', 3);
  return [
    '(max-width: 767px) 100vw',
    `(max-width: 1023px) ${Math.round(100 / tablet)}vw`,
    `${Math.round(100 / desktop)}vw`,
  ].join(', ');
}
