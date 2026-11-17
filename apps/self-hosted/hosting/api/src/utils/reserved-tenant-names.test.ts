import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isReservedTenantName } from './reserved-tenant-names';

// A tenant's config is written as configs/<username>.json, and nginx falls
// back to configs/default.json for every unclaimed subdomain. A tenant named
// like that fallback must never exist.

describe('isReservedTenantName', () => {
  it('reserves the fallback config name, in any case', () => {
    expect(isReservedTenantName('default')).toBe(true);
    expect(isReservedTenantName('Default')).toBe(true);
  });

  it('leaves ordinary names alone', () => {
    expect(isReservedTenantName('alice')).toBe(false);
    expect(isReservedTenantName('defaults')).toBe(false);
  });

  it.each(['../routes/tenants.ts', '../payment-listener.ts', '../routes/internal.ts'])(
    '%s refuses a reserved name before creating a tenant',
    (file) => {
      expect(readFileSync(join(__dirname, file), 'utf8')).toContain('isReservedTenantName(');
    }
  );
});
