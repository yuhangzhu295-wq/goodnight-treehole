import { describe, expect, it } from 'vitest';
import { checkMigrationImmutability, BASELINE_MIGRATIONS } from '../../scripts/check-migration-immutability';

describe('migration immutability integrity', () => {
  it('confirms all 12 baseline migrations match their recorded checksums exactly', () => {
    const result = checkMigrationImmutability();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(Object.keys(BASELINE_MIGRATIONS)).toHaveLength(12);
  });
});
