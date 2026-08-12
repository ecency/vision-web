import {
  DEFAULT_STYLE_TEMPLATE,
  STYLE_TEMPLATES,
} from '../../../../hosting/api/src/style-templates';
import { STYLE_TEMPLATE_DISPLAY } from '../../../../hosting/api/src/style-template-display';
import { FLOATING_MENU_THEME } from '../constants';

interface Props {
  /** The edited document's styleTemplate; unset means the default. */
  value: unknown;
  onPick: (id: string) => void;
}

const HEADING_FONT: Record<string, string> = {
  serif: 'font-serif',
  sans: 'font-sans',
  mono: 'font-mono',
};

/**
 * The template choice as cards built from each template's own palette, the
 * same presentation the signup uses: picking a look should read like picking
 * a look, not like filling a form. Rendered from the roster and its display
 * catalog, so a new template appears here the moment it exists.
 */
export function TemplateCards({ value, onPick }: Props) {
  const selected =
    typeof value === 'string' && (STYLE_TEMPLATES as readonly string[]).includes(value)
      ? value
      : DEFAULT_STYLE_TEMPLATE;

  return (
    <div
      role="radiogroup"
      aria-label="Style template"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
    >
      {STYLE_TEMPLATES.map((id) => {
        const display = STYLE_TEMPLATE_DISPLAY[id];
        const isSelected = selected === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onPick(id)}
            className="text-left rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
            style={{
              border: isSelected
                ? '2px solid #3b82f6'
                : `1px solid ${FLOATING_MENU_THEME.borderColorStrong}`,
            }}
          >
            <div
              className="h-14 px-2 pt-2"
              style={{ backgroundColor: display.colors.background }}
            >
              <div
                className="h-full rounded-t px-2 pt-1.5 flex items-start justify-between"
                style={{ backgroundColor: display.colors.surface }}
              >
                <span
                  className={`text-sm leading-none ${HEADING_FONT[display.headingStyle] ?? 'font-sans'}`}
                  style={{ color: display.colors.text }}
                >
                  Aa
                </span>
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full mt-0.5"
                  style={{ backgroundColor: display.colors.accent }}
                />
              </div>
            </div>
            <div
              className="px-2 py-1.5"
              style={{ backgroundColor: FLOATING_MENU_THEME.inputBackground }}
            >
              <div className="text-xs font-medium text-gray-100 font-sans">
                {display.name}
              </div>
              <div className="text-[10px] text-gray-400 font-sans line-clamp-1">
                {display.tagline}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
