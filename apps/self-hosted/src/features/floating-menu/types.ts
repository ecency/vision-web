import type { ConfigField } from './config-fields';

export type ConfigPrimitive = string | number | boolean | null;
export type ConfigArray = ConfigPrimitive[] | ConfigObject[];
export interface ConfigObject {
  [key: string]: ConfigPrimitive | ConfigArray | ConfigObject;
}
export type ConfigValue = ConfigPrimitive | ConfigArray | ConfigObject;

export interface ConfigEditorProps {
  config: Record<string, ConfigValue>;
  fields: Record<string, ConfigField>;
  path?: string;
  onUpdate: (path: string, value: ConfigValue) => void;
  /**
   * The whole document, threaded down unchanged through the recursion.
   *
   * `config` is the node at the current path, so a validator reached from a
   * nested section can only see its own siblings. Some rules are about
   * combinations: an external composer URL is ignored entirely on a community
   * instance, and the instance type lives in a different branch of the tree.
   *
   * Absent at the top call, where `config` already is the whole document.
   */
  root?: Record<string, ConfigValue>;
}

export interface ConfigFieldEditorProps {
  field: ConfigField;
  fieldKey: string;
  value: ConfigValue;
  /** The whole document; see ConfigEditorProps.root. */
  root?: Record<string, ConfigValue>;
  path?: string;
  onUpdate: (path: string, value: ConfigValue) => void;
}
