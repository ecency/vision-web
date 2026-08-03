import { memo, useEffect, useMemo, useState } from 'react';
import { validateArrayDraft, validateArrayEntries } from '../array-field';
import type { ConfigField } from '../config-fields';
import { FLOATING_MENU_THEME } from '../constants';
import type {
  ConfigEditorProps,
  ConfigFieldEditorProps,
  ConfigValue,
} from '../types';

const sectionIcons: Record<string, string> = {
  configuration: '⚙️',
  general: '🌐',
  styles: '🎨',
  instanceConfiguration: '🔧',
  meta: '📝',
  layout: '📐',
  search: '🔍',
  sidebar: '📋',
  followers: '👥',
  following: '👤',
  hiveInformation: '🐝',
  features: '✨',
  communities: '🏘️',
  likes: '❤️',
  wallet: '💳',
  comments: '💬',
  post: '📄',
  text2Speech: '🔊',
  hivesigner: '🔑',
} as const;

function getSectionIcon(label: string): string {
  const key = Object.keys(sectionIcons).find(
    (k) => k.toLowerCase() === label.toLowerCase().replace(/\s+/g, ''),
  );
  return key ? sectionIcons[key]! : '📦';
}

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
  ({ field, fieldKey, value, path, onUpdate }) => {
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
        const isChecked = value === true;
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

      case 'number': {
        const numValue = typeof value === 'number' ? value : undefined;
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
              type="number"
              value={numValue ?? ''}
              onChange={(e) =>
                handleChange(
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
              className={inputClassName}
              style={inputStyle}
            />
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
        const selectValue = typeof value === 'string' ? value : '';
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

      default: {
        const stringValue = typeof value === 'string' ? value : '';
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
              onChange={(e) => handleChange(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
          </div>
        );
      }
    }
  },
);

ConfigFieldEditor.displayName = 'ConfigFieldEditor';

export const ConfigEditor = memo<ConfigEditorProps>(
  ({ config, fields, path, onUpdate }) => {
    const { sections, regularFields } = useMemo(() => {
      const sectionsList: Array<[string, ConfigField]> = [];
      const regularList: Array<[string, ConfigField]> = [];

      Object.entries(fields).forEach(([key, field]) => {
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
    }, [fields]);

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
            />
          );
        })}
      </div>
    );
  },
);

ConfigEditor.displayName = 'ConfigEditor';
