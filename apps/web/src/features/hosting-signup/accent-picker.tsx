"use client";

import { FormControl } from "@ui/input";
import i18next from "i18next";
import { ACCENT_HEX_PATTERN } from "./hosting-api";

interface Props {
  /** The committed accent (valid hex), or null for the template's own. */
  value: string | null;
  /** The raw field text, which may be mid-edit and invalid. */
  input: string;
  onInput: (raw: string) => void;
  onPick: (hex: string | null) => void;
}

/**
 * A short row of quick picks plus a free hex field. Curated rather than a
 * wheel: one accent is the whole knob, and the instance derives hover and
 * contrast from it, so any readable hue works.
 */
const QUICK_PICKS = ["#e74c3c", "#e67e22", "#1a8917", "#0066cc", "#7c3aed", "#e91e8c"];

export function AccentPicker({ value, input, onInput, onPick }: Props) {
  const trimmed = input.trim();
  const invalid = trimmed.length > 0 && !ACCENT_HEX_PATTERN.test(trimmed);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {QUICK_PICKS.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            aria-pressed={value === hex}
            onClick={() => {
              onPick(value === hex ? null : hex);
            }}
            className={`w-7 h-7 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-blue-dark-sky ${
              value === hex ? "border-blue-dark-sky" : "border-transparent"
            }`}
            style={{ backgroundColor: hex }}
          />
        ))}
        {value && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="text-sm text-blue-dark-sky hover:underline"
          >
            {i18next.t("hosting.accent-clear")}
          </button>
        )}
      </div>
      <FormControl
        type="text"
        value={input}
        onChange={(e: any) => onInput(e.target.value)}
        placeholder="#0066cc"
        aria-invalid={invalid}
        aria-label={i18next.t("hosting.accent-label")}
      />
      {invalid && <p className="text-sm text-red">{i18next.t("hosting.accent-invalid")}</p>}
    </div>
  );
}
