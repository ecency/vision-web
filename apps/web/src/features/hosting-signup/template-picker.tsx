"use client";

import i18next from "i18next";
import type { HostingTemplate } from "./hosting-api";

interface Props {
  templates: HostingTemplate[] | null;
  /** Load failure: signup must keep working; the instance starts on the default look. */
  failed: boolean;
  value: string | null;
  onChange: (id: string | null) => void;
}

const HEADING_FONT: Record<HostingTemplate["headingStyle"], string> = {
  serif: "font-serif",
  sans: "font-sans",
  mono: "font-mono"
};

/**
 * The template choice as cards instead of a dropdown: each card is a small
 * mock of the template built from its own palette (page, surface bar, accent
 * dot, a type sample), so picking a look reads as picking a look. Selecting
 * the already-selected card clears back to the default.
 */
export function TemplatePicker({ templates, failed, value, onChange }: Props) {
  if (failed) {
    return <p className="text-sm opacity-75">{i18next.t("hosting.template-load-failed")}</p>;
  }
  if (!templates) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-lg border border-[--border-color] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label={i18next.t("hosting.template-label")} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {templates.map((t) => {
        const selected = value === t.id || (value === null && t.isDefault);
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(value === t.id ? null : t.id)}
            className={`text-left rounded-lg border overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-dark-sky ${
              selected ? "border-blue-dark-sky ring-1 ring-blue-dark-sky" : "border-[--border-color]"
            }`}
          >
            <div className="h-12 px-2 pt-2" style={{ backgroundColor: t.colors.background }}>
              <div
                className="h-full rounded-t px-1.5 pt-1 flex items-start justify-between"
                style={{ backgroundColor: t.colors.surface }}
              >
                <span
                  className={`${HEADING_FONT[t.headingStyle]} text-sm leading-none`}
                  style={{ color: t.colors.text }}
                  aria-hidden="true"
                >
                  Aa
                </span>
                <span
                  className="inline-block size-3 rounded-full"
                  style={{ backgroundColor: t.colors.accent }}
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="px-2 py-1.5">
              <div className="text-sm font-semibold leading-tight">{t.name}</div>
              <div className="text-xs opacity-60 leading-tight">{t.tagline}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
