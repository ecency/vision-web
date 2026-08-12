import { memo, useEffect, useMemo, useState } from 'react';
import { isFieldVisible } from '../config-fields';
import { LiveRegion } from '@/features/shared/live-region';
import { validateArrayDraft, validateArrayEntries } from '../array-field';
import type { ConfigField } from '../config-fields';
import { FLOATING_MENU_THEME } from '../constants';
import {
  colorInputMessage,
  colorPickerValue,
  displayedBooleanValue,
  displayedSelectValue,
  displayedStringValue,
  getSectionIcon,
} from '../field-display';
import type {
  ConfigEditorProps,
  ConfigFieldEditorProps,
  ConfigValue,
} from '../types';

// Separate component for array fields to handle draft state
interface ArrayFieldEditorProps {
  field: ConfigField;
  fullPath: string;
  value: ConfigValue;
  inputClassName: string;
  inputStyle: React.CSSProperties;
  handleChange: (newValue: ConfigValue) => void;
}

function ArrayFieldEditor({
  field,
  fullPath,
  value,
  inputClassName,
  inputStyle,
  handleChange,
}: ArrayFieldEditorProps) {
  const arrayValue = Array.isArray(value) ? value : [];
  // Memoize the serialized value to avoid recalculating on every render
  const serializedValue = useMemo(() => JSON.stringify(arrayValue), [arrayValue]);
  const [draftJson, setDraftJson] = useState(() => JSON.stringify(arrayValue, null, 2));
  // Checked on mount too, so a value that is already in the saved config is
  // reported rather than waiting for the owner to touch the field.
  const [error, setError] = useState<string | null>(() =>
    validateArrayEntries(arrayValue, field.allowedValues),
  );
  const isValid = error === null;

  // Sync draft when external value changes
  useEffect(() => {
    const newJson = JSON.stringify(arrayValue, null, 2);
    setDraftJson(newJson);
    setError(validateArrayEntries(arrayValue, field.allowedValues));
  }, [serializedValue, field.allowedValues]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setDraftJson(newValue);

    // A rejected draft is never written into the config: the owner keeps
    // looking at what they typed and at the reason it was not taken.
    const result = validateArrayDraft(newValue, field.allowedValues);
    setError(result.error);
    if (result.value) {
      handleChange(result.value);
    }
  };

  return (
    <div className="mb-4">
      <label
        htmlFor={fullPath}
        className="block text-sm font-medium text-gray-200 mb-2 font-sans"
      >
        {field.label}
      </label>
      {field.description && (
        <p className="text-xs text-gray-400 mb-2 font-sans">
          {field.description}
        </p>
      )}
      <textarea
        id={fullPath}
        value={draftJson}
        onChange={handleTextChange}
        className={`${inputClassName} font-mono`}
        style={{
          ...inputStyle,
          borderColor: isValid ? FLOATING_MENU_THEME.borderColor : '#ef4444',
        }}
        rows={4}
        aria-label={field.label}
        aria-invalid={!isValid}
      />
      <p className={`text-xs mt-1 font-sans ${isValid ? 'text-gray-400' : 'text-red-400'}`}>
        {error ?? 'Enter a valid JSON array'}
      </p>
    </div>
  );
}

const ConfigFieldEditor = memo<ConfigFieldEditorProps>(
  ({ field, fieldKey, value, path, onUpdate, root }) => {
    const fullPath = path ? `${path}.${fieldKey}` : fieldKey;

    if (field.type === 'section' && field.fields) {
      return (
        <section
          className="mb-6 border rounded-lg p-4"
          style={{ borderColor: FLOATING_MENU_THEME.borderColor }}
        >
          <h3 className="text-sm font-semibold mb-3 text-white font-sans flex items-center gap-2">
            <span aria-hidden="true">{getSectionIcon(field.label)}</span>
            {field.label}
          </h3>
          {field.description && (
            <p className="text-sm text-gray-400 mb-4 font-sans">
              {field.description}
            </p>
          )}
          <div className="mt-4">
            <ConfigEditor
              config={(value as Record<string, ConfigValue>) || {}}
              fields={field.fields}
              path={fullPath}
              onUpdate={onUpdate}
              root={root}
            />
          </div>
        </section>
      );
    }

    const handleChange = (newValue: ConfigValue) => {
      onUpdate(fullPath, newValue);
    };

    const inputClassName =
      'w-full px-3 py-2 rounded text-sm text-gray-100 font-sans focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors';
    const inputStyle = {
      backgroundColor: FLOATING_MENU_THEME.inputBackground,
      border: `1px solid ${FLOATING_MENU_THEME.borderColorStrong}`,
    };

    switch (field.type) {
      case 'boolean': {
        const isChecked = displayedBooleanValue(field, value);
        return (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-200 mb-2 font-sans">
              {field.label}
            </label>
            {field.description && (
              <p className="text-xs text-gray-400 mb-2 font-sans">
                {field.description}
              </p>
            )}
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => handleChange(e.target.checked)}
                className="sr-only peer"
                aria-label={`${field.label}: ${
                  isChecked ? 'Enabled' : 'Disabled'
                }`}
              />
              <div
                className="w-11 h-6 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:size-5 after:transition-all"
                style={{
                  backgroundColor: isChecked
                    ? FLOATING_MENU_THEME.toggleActive
                    : FLOATING_MENU_THEME.toggleInactive,
                  borderColor: FLOATING_MENU_THEME.borderColorStrong,
                }}
                aria-hidden="true"
              />
              <span className="ml-3 text-sm text-gray-300 font-sans">
                {isChecked ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        );
      }

      case 'array': {
        return (
          <ArrayFieldEditor
            field={field}
            fullPath={fullPath}
            value={value}
            inputClassName={inputClassName}
            inputStyle={inputStyle}
            handleChange={handleChange}
          />
        );
      }

      case 'select': {
        const selectValue = displayedSelectValue(field, value);
        const options = field.options || [];
        return (
          <div className="mb-4">
            <label
              htmlFor={fullPath}
              className="block text-sm font-medium text-gray-200 mb-2 font-sans"
            >
              {field.label}
            </label>
            {field.description && (
              <p className="text-xs text-gray-400 mb-2 font-sans">
                {field.description}
              </p>
            )}
            <select
              id={fullPath}
              value={selectValue}
              onChange={(e) => handleChange(e.target.value)}
              className={inputClassName}
              style={{
                ...inputStyle,
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239CA3AF'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '1rem',
                paddingRight: '2.5rem',
              }}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );
      }

      case 'color': {
        const colorText = displayedStringValue(field, value);
        const note = colorInputMessage(colorText);
        return (
          <div className="mb-4">
            <label
              htmlFor={fullPath}
              className="block text-sm font-medium text-gray-200 mb-2 font-sans"
            >
              {field.label}
            </label>
            {field.description && (
              <p className="text-xs text-gray-400 mb-2 font-sans">
                {field.description}
              </p>
            )}
            {/* One-click curated swatches above the free input: visual
                choices get visual controls, and the hex field stays for
                everything the row does not offer. */}
            {field.quickPicks && field.quickPicks.length > 0 && (
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {field.quickPicks.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => handleChange(hex)}
                    aria-label={hex}
                    className="size-7 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{
                      backgroundColor: hex,
                      border:
                        colorText === hex
                          ? '2px solid #ffffff'
                          : `1px solid ${FLOATING_MENU_THEME.borderColorStrong}`,
                    }}
                  />
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              {/*
                A swatch beside the text, not instead of it. The native control
                has no empty state, so it can pick a colour but can never say
                "use the template's", which is where every instance starts.
              */}
              <input
                type="color"
                value={colorPickerValue(colorText)}
                onChange={(e) => handleChange(e.target.value)}
                className="h-9 w-12 shrink-0 cursor-pointer rounded bg-transparent"
                style={{
                  border: `1px solid ${FLOATING_MENU_THEME.borderColorStrong}`,
                }}
                aria-label={`${field.label} swatch`}
              />
              <input
                id={fullPath}
                type="text"
                value={colorText}
                maxLength={field.maxLength}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="#0969da"
                spellCheck={false}
                className={`${inputClassName} font-mono`}
                style={{
                  ...inputStyle,
                  borderColor: note?.invalid
                    ? '#ef4444'
                    : FLOATING_MENU_THEME.borderColorStrong,
                }}
                aria-invalid={note?.invalid ? true : undefined}
                aria-describedby={`${fullPath}-note`}
              />
              {colorText !== '' && (
                <button
                  type="button"
                  onClick={() => handleChange('')}
                  className="shrink-0 px-2 py-2 text-xs text-gray-400 hover:text-gray-200 font-sans"
                  // The way back to the template's own colour, which is what
                  // the font preset spells out as "Theme default". Without it
                  // the first colour an owner picks is permanent.
                  title="Clear, and use the style template's color"
                >
                  Clear
                </button>
              )}
            </div>
            {/*
              Both regions stay mounted from the first render, because a live
              region that appears together with its first message is usually
              not announced at all. The id ties whichever message is showing to
              the input, so the note is also read when the field gets focus.
            */}
            <div id={`${fullPath}-note`}>
              <LiveRegion
                className="block text-xs mt-1 font-sans text-gray-400"
                message={note && !note.invalid ? note.message : null}
              />
              <LiveRegion
                urgency="assertive"
                className="block text-xs mt-1 font-sans text-red-400"
                message={note?.invalid ? note.message : null}
              />
            </div>
          </div>
        );
      }

      default: {
        const stringValue = displayedStringValue(field, value);
        // Only fields whose resolver refuses something carry `validate`, so
        // most string inputs are unchanged and render no region at all.
        const stringNote = field.validate?.(stringValue, root) ?? null;
        return (
          <div className="mb-4">
            <label
              htmlFor={fullPath}
              className="block text-sm font-medium text-gray-200 mb-2 font-sans"
            >
              {field.label}
            </label>
            {field.description && (
              <p className="text-xs text-gray-400 mb-2 font-sans">
                {field.description}
              </p>
            )}
            <input
              id={fullPath}
              type="text"
              value={stringValue}
              maxLength={field.maxLength}
              onChange={(e) => handleChange(e.target.value)}
              className={inputClassName}
              style={{
                ...inputStyle,
                borderColor: stringNote
                  ? '#ef4444'
                  : FLOATING_MENU_THEME.borderColorStrong,
              }}
              aria-invalid={stringNote ? true : undefined}
              aria-describedby={field.validate ? `${fullPath}-note` : undefined}
            />
            {/*
              Mounted from the first render whenever the field can produce a
              message at all, because a live region that appears together with
              its first message is usually not announced. Fields without
              `validate` render nothing here.
            */}
            {field.validate && (
              <div id={`${fullPath}-note`}>
                <LiveRegion
                  urgency="assertive"
                  className="block text-xs mt-1 font-sans text-red-400"
                  message={stringNote}
                />
              </div>
            )}
          </div>
        );
      }
    }
  },
);

ConfigFieldEditor.displayName = 'ConfigFieldEditor';

export const ConfigEditor = memo<ConfigEditorProps>(
  ({ config, fields, path, onUpdate, root }) => {
    // The top call has no `root`, and there `config` IS the whole document.
    // Every deeper call receives it unchanged.
    const document = root ?? config;
    const { sections, regularFields } = useMemo(() => {
      const sectionsList: Array<[string, ConfigField]> = [];
      const regularList: Array<[string, ConfigField]> = [];

      Object.entries(fields).forEach(([key, field]) => {
        // Visibility is decided against the whole document, so an option can
        // depend on a value in another branch (the style template, above all).
        if (!isFieldVisible(field, document)) return;
        if (field.type === 'section') {
          sectionsList.push([key, field]);
        } else {
          regularList.push([key, field]);
        }
      });

      return {
        sections: sectionsList,
        regularFields: regularList,
      };
    }, [fields, document]);

    return (
      <div className="space-y-4">
        {/* Regular fields in grid */}
        {regularFields.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {regularFields.map(([key, field]) => {
              const value = config?.[key];
              return (
                <ConfigFieldEditor
                  key={key}
                  field={field}
                  fieldKey={key}
                  value={value}
                  path={path}
                  onUpdate={onUpdate}
                  root={document}
                />
              );
            })}
          </div>
        )}

        {/* Sections */}
        {sections.map(([key, field]) => {
          const value = config?.[key];
          return (
            <ConfigFieldEditor
              key={key}
              field={field}
              fieldKey={key}
              value={value}
              path={path}
              onUpdate={onUpdate}
              root={document}
            />
          );
        })}
      </div>
    );
  },
);

ConfigEditor.displayName = 'ConfigEditor';
