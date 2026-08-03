import { describe, expect, it } from 'vitest';
import { AUTH_METHODS } from '@/features/auth/utils/auth-methods';
import type { ConfigField } from './config-fields';
import { configFieldsMap } from './config-fields';

/** The field at a config path, or undefined when the editor does not offer it. */
function fieldAt(path: readonly string[]): ConfigField | undefined {
  let fields: Record<string, ConfigField> | undefined = configFieldsMap;
  let field: ConfigField | undefined;

  for (const key of path) {
    field = fields?.[key];
    if (!field) return undefined;
    fields = field.fields;
  }

  return field;
}

const CLIENT_ID_PATH = [
  'configuration',
  'general',
  'hivesigner',
  'clientId',
] as const;
const METHODS_PATH = [
  'configuration',
  'instanceConfiguration',
  'features',
  'auth',
  'methods',
] as const;

/**
 * Without this the setting exists only in the JSON document, which an owner on
 * managed hosting has no way to reach, so Hivesigner login could be configured
 * and never switched on.
 */
describe('hivesigner client id', () => {
  it('is offered in the editor, at the path the app reads', () => {
    expect(fieldAt(CLIENT_ID_PATH)).toBeDefined();
  });

  /**
   * A text input. The number input writes null when cleared, and null erases
   * the stored section on merge.
   */
  it('is a text field', () => {
    expect(fieldAt(CLIENT_ID_PATH)?.type).toBe('string');
  });

  it('gives both routes to a working setup', () => {
    const description = fieldAt(CLIENT_ID_PATH)?.description ?? '';

    // Route one: the owner registers an app themselves.
    expect(description).toContain('register your own');
    // Route two: only Ecency can register this site on the shared app.
    expect(description).toContain('hello@ecency.com');
    expect(description).toContain('ecency.app');
  });

  it('is pointed at from the login methods field', () => {
    expect(fieldAt(METHODS_PATH)?.description).toContain('Hivesigner');
  });
});

describe('login methods', () => {
  /** A list of names, never objects: the hosting API drops those and reports success. */
  it('stays a list', () => {
    expect(fieldAt(METHODS_PATH)?.type).toBe('array');
  });

  it('accepts only the methods the app can serve', () => {
    expect(fieldAt(METHODS_PATH)?.allowedValues).toEqual(AUTH_METHODS);
  });
});
