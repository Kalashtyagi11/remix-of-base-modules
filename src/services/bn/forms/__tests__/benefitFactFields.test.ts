import { describe, it, expect } from 'vitest';
import {
  getBenefitFactFields,
  getCategoryFactFields,
  normalizeBenefitKey,
} from '../sectionCatalogue';
import { getCategoryDetailFields } from '../benefitDetailFields';

describe('benefit fact field resolution', () => {
  it('resolves recognised product codes to their benefit catalogue', () => {
    const fields = getBenefitFactFields('SKN_AGE', 'LONG_TERM');
    expect(fields.map(f => f.field_code)).toContain('retirement_date');
    expect(normalizeBenefitKey('SKN_AGE')).toBe('AGE_BENEFIT');
  });

  it('falls back to the category vocabulary for unrecognised codes', () => {
    // ASST_PENSION carries no recognisable benefit token — previously this
    // returned nothing and the intake step captured no benefit facts.
    expect(normalizeBenefitKey('ASST_PENSION')).toBeNull();
    const fields = getBenefitFactFields('ASST_PENSION', 'LONG_TERM');
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.map(f => f.field_code)).toEqual(
      getCategoryDetailFields('LONG_TERM').map(f => f.key),
    );
  });

  it('shares one vocabulary with the workbench detail section', () => {
    for (const category of ['LONG_TERM', 'SHORT_TERM', 'GRANT', 'NON_CONTRIBUTORY']) {
      expect(getCategoryFactFields(category).map(f => f.field_code)).toEqual(
        getCategoryDetailFields(category).map(f => f.key),
      );
    }
  });

  it('never returns an empty field set, whatever the category', () => {
    expect(getBenefitFactFields(null, null).length).toBeGreaterThan(0);
    expect(getBenefitFactFields('WHATEVER_X', 'UNKNOWN_CATEGORY').length).toBeGreaterThan(0);
  });
});
