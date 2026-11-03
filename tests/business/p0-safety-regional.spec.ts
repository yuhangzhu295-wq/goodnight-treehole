import { describe, expect, it } from 'vitest';
import { getRegionalSafetyResources, SUPPORTED_SAFETY_REGIONS } from '../../apps/api/src/safety-resources.js';
import { PublicController } from '../../apps/api/src/controllers.js';

describe('P0-A: Regional Safety Resources Contract', () => {
  it('returns universal SOS guidance and empty resource list when region is UNKNOWN or omitted', () => {
    const unknownRes = getRegionalSafetyResources();
    expect(unknownRes.isUnknownRegion).toBe(true);
    expect(unknownRes.region).toBe('UNKNOWN');
    expect(unknownRes.resources).toHaveLength(0);
    expect(unknownRes.universalGuidance.length).toBeGreaterThanOrEqual(3);
    expect(unknownRes.universalGuidance[0]).toContain('Emergency SOS');
    expect(unknownRes.supportedRegions).toEqual(SUPPORTED_SAFETY_REGIONS);
  });

  it('does NOT default to China mainland numbers when given invalid or other region', () => {
    const invalidRes = getRegionalSafetyResources('INVALID_REGION_XYZ');
    expect(invalidRes.isUnknownRegion).toBe(true);
    expect(invalidRes.region).toBe('UNKNOWN');
    expect(invalidRes.resources).toHaveLength(0);
  });

  it('returns verified Mainland China resources for region=CN', () => {
    const cnRes = getRegionalSafetyResources('CN');
    expect(cnRes.isUnknownRegion).toBe(false);
    expect(cnRes.region).toBe('CN');
    expect(cnRes.resources.map((r) => r.number)).toContain('120');
    expect(cnRes.resources.map((r) => r.number)).toContain('12356');
    expect(cnRes.resources.every((r) => r.verified)).toBe(true);
  });

  it('returns verified Hong Kong resources for region=HK', () => {
    const hkRes = getRegionalSafetyResources('hk');
    expect(hkRes.isUnknownRegion).toBe(false);
    expect(hkRes.region).toBe('HK');
    expect(hkRes.resources.map((r) => r.number)).toContain('999');
    expect(hkRes.resources.some((r) => r.name.includes('撒玛利亚'))).toBe(true);
  });

  it('returns verified Macau resources for region=MO', () => {
    const moRes = getRegionalSafetyResources('mo');
    expect(moRes.isUnknownRegion).toBe(false);
    expect(moRes.region).toBe('MO');
    expect(moRes.resources.map((r) => r.number)).toContain('999');
    expect(moRes.resources.some((r) => r.name.includes('明爱'))).toBe(true);
  });

  it('returns verified Taiwan resources for region=TW', () => {
    const twRes = getRegionalSafetyResources('TW');
    expect(twRes.isUnknownRegion).toBe(false);
    expect(twRes.region).toBe('TW');
    expect(twRes.resources.map((r) => r.number)).toContain('119');
    expect(twRes.resources.map((r) => r.number)).toContain('1925');
  });

  it('returns international support links for region=OTHER', () => {
    const otherRes = getRegionalSafetyResources('OTHER');
    expect(otherRes.isUnknownRegion).toBe(false);
    expect(otherRes.region).toBe('OTHER');
    expect(otherRes.resources.some((r) => r.action === 'link')).toBe(true);
    expect(otherRes.resources.some((r) => r.url?.includes('findahelpline'))).toBe(true);
  });

  it('PublicController.safetyResources routes correctly to regional service', async () => {
    const controller = new PublicController({} as any, {} as any, {} as any);

    const unknownRes = await controller.safetyResources();
    expect(unknownRes.isUnknownRegion).toBe(true);
    expect(unknownRes.region).toBe('UNKNOWN');

    const cnRes = await controller.safetyResources('CN');
    expect(cnRes.isUnknownRegion).toBe(false);
    expect(cnRes.region).toBe('CN');
    expect(cnRes.resources.length).toBeGreaterThanOrEqual(3);
    expect(cnRes.resources[0].number).toBe('120');

    const hkRes = await controller.safetyResources('HK');
    expect(hkRes.isUnknownRegion).toBe(false);
    expect(hkRes.region).toBe('HK');
    expect(hkRes.resources[0].number).toBe('999');
  });
});
