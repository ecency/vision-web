import { beforeEach, describe, expect, it } from 'vitest';
import { InstanceConfigManager } from './configuration-loader';
import {
  formatCustom,
  formatDate,
  formatDateTime,
  formatMonthYear,
  formatRelativeDate,
  formatTime,
} from './date-formatter';

const DATE = '2024-01-16T10:00:00';

function configure(general: Record<string, unknown>) {
  const current = InstanceConfigManager.getConfig();
  InstanceConfigManager.updateConfig({
    ...current,
    configuration: {
      ...current.configuration,
      general: { ...current.configuration.general, ...general },
    },
  } as never);
}

/**
 * These fields are free text in the config editor and are read while rendering
 * every post card, so an invalid value used to take the whole blog down to the
 * root error boundary rather than spoiling one timestamp.
 */
describe('date formatting with invalid configuration', () => {
  beforeEach(() => {
    configure({
      timezone: 'UTC',
      dateFormat: 'yyyy-MM-dd',
      timeFormat: 'HH:mm:ss',
      dateTimeFormat: 'yyyy-MM-dd HH:mm:ss',
    });
  });

  it('survives a timezone that is not an IANA zone', () => {
    configure({ timezone: 'UTC+3' });

    expect(() => formatDate(DATE)).not.toThrow();
    expect(formatDate(DATE)).not.toBe('');
    expect(() => formatTime(DATE)).not.toThrow();
    expect(() => formatDateTime(DATE)).not.toThrow();
    expect(() => formatRelativeDate(DATE)).not.toThrow();
    expect(() => formatMonthYear(DATE)).not.toThrow();
  });

  it('survives a Moment style pattern date-fns cannot parse', () => {
    // Uppercase A is not a date-fns token and throws a RangeError.
    configure({ timeFormat: 'hh:mm A' });

    expect(() => formatTime(DATE)).not.toThrow();
    expect(formatTime(DATE)).not.toBe('');
  });

  it('survives a pattern made of literal words', () => {
    configure({ dateFormat: 'Updated on' });

    expect(() => formatDate(DATE)).not.toThrow();
    expect(formatDate(DATE)).not.toBe('');
  });

  it('survives an invalid custom pattern', () => {
    expect(() => formatCustom(DATE, 'hh:mm A')).not.toThrow();
    expect(formatCustom(DATE, 'hh:mm A')).not.toBe('');
  });

  it('still formats correctly when the configuration is valid', () => {
    expect(formatDate(DATE)).toBe('2024-01-16');
    expect(formatTime(DATE)).toBe('10:00:00');
  });

  it('returns empty rather than throwing for an unparseable date', () => {
    expect(formatMonthYear('not a date')).toBe('');
    expect(formatCustom('not a date', 'yyyy')).toBe('');
  });
});
