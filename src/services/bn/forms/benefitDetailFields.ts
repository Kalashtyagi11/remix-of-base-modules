/**
 * BN — Canonical benefit-detail field vocabulary (per product category).
 *
 * Single source of truth shared by:
 *   - the intake wizard's "Benefit-Specific Facts" step (via sectionCatalogue)
 *   - the Claim Workbench "Benefit-Specific Details" section
 *
 * Keys must match the field ownership registry (src/lib/bn/fieldOwnership.ts)
 * and are the keys written to bn_claim_detail.detail_json.
 *
 * This module intentionally has no imports — both consumers depend on it, so
 * it must stay at the bottom of the dependency graph.
 */

export type BenefitDetailFieldType = 'text' | 'date' | 'number' | 'checkbox';

export interface BenefitDetailFieldDef {
  key: string;
  label: string;
  type: BenefitDetailFieldType;
  required: boolean;
}

/** Section code used when these fields are surfaced through the form engine. */
export const BENEFIT_DETAIL_SECTION_CODE = 'benefit_detail';

export const CATEGORY_DETAIL_FIELDS: Record<string, BenefitDetailFieldDef[]> = {
  SHORT_TERM: [
    { key: 'illness_start_date', label: 'Illness Start Date', type: 'date', required: true },
    { key: 'last_worked_date', label: 'Last Worked Date', type: 'date', required: false },
    { key: 'expected_return_date', label: 'Expected Return Date', type: 'date', required: false },
    { key: 'diagnosis_code', label: 'Diagnosis Code', type: 'text', required: false },
    { key: 'doctor_name', label: 'Doctor Name', type: 'text', required: true },
    { key: 'doctor_reg_no', label: 'Doctor Reg. No', type: 'text', required: false },
    { key: 'hospital_clinic', label: 'Hospital/Clinic', type: 'text', required: false },
    { key: 'medical_cert_verified', label: 'Medical Cert Verified', type: 'checkbox', required: false },
    { key: 'work_related', label: 'Work Related', type: 'checkbox', required: false },
    { key: 'employer_notified', label: 'Employer Notified', type: 'checkbox', required: false },
  ],
  LONG_TERM: [
    { key: 'retirement_date', label: 'Retirement Date', type: 'date', required: true },
    { key: 'pension_type', label: 'Pension Type', type: 'text', required: true },
    { key: 'best_years_start', label: 'Best Years Start', type: 'number', required: false },
    { key: 'best_years_end', label: 'Best Years End', type: 'number', required: false },
    { key: 'total_contribution_weeks', label: 'Contribution Weeks', type: 'number', required: false },
  ],
  PENSION: [
    { key: 'retirement_date', label: 'Retirement Date', type: 'date', required: true },
    { key: 'pension_type', label: 'Pension Type', type: 'text', required: true },
    { key: 'tier_applied', label: 'Tier', type: 'text', required: false },
    { key: 'total_contribution_weeks', label: 'Contribution Weeks', type: 'number', required: false },
  ],
  INJURY: [
    { key: 'injury_date', label: 'Injury Date', type: 'date', required: true },
    { key: 'injury_description', label: 'Injury Description', type: 'text', required: true },
    { key: 'injury_location', label: 'Injury Location', type: 'text', required: true },
    { key: 'body_part_affected', label: 'Body Part Affected', type: 'text', required: false },
    { key: 'disablement_percentage', label: 'Disablement %', type: 'number', required: false },
    { key: 'is_temporary', label: 'Temporary Disability', type: 'checkbox', required: false },
    { key: 'employer_report_date', label: 'Employer Report Date', type: 'date', required: false },
  ],
  GRANT: [
    { key: 'deceased_ssn', label: 'Deceased SSN', type: 'text', required: true },
    { key: 'deceased_name', label: 'Deceased Name', type: 'text', required: true },
    { key: 'date_of_death', label: 'Date of Death', type: 'date', required: true },
    { key: 'relationship_to_claimant', label: 'Relationship', type: 'text', required: true },
    { key: 'funeral_date', label: 'Funeral Date', type: 'date', required: false },
    { key: 'funeral_home', label: 'Funeral Home', type: 'text', required: false },
    { key: 'is_employment_injury_death', label: 'EI-Related Death', type: 'checkbox', required: false },
  ],
  SURVIVOR: [
    { key: 'deceased_ssn', label: 'Deceased SSN', type: 'text', required: true },
    { key: 'deceased_name', label: 'Deceased Name', type: 'text', required: true },
    { key: 'date_of_death', label: 'Date of Death', type: 'date', required: true },
    { key: 'relationship', label: 'Relationship', type: 'text', required: true },
    { key: 'survivor_dob', label: 'Survivor DOB', type: 'date', required: false },
    { key: 'is_dependent_child', label: 'Dependent Child', type: 'checkbox', required: false },
    { key: 'school_name', label: 'School Name', type: 'text', required: false },
  ],
  NON_CONTRIBUTORY: [
    { key: 'means_test_date', label: 'Means Test Date', type: 'date', required: true },
    { key: 'monthly_income', label: 'Monthly Income (EC$)', type: 'number', required: true },
    { key: 'income_threshold', label: 'Income Threshold (EC$)', type: 'number', required: false },
    { key: 'means_test_passed', label: 'Means Test Passed', type: 'checkbox', required: false },
    { key: 'living_arrangement', label: 'Living Arrangement', type: 'text', required: false },
    { key: 'other_pension_amount', label: 'Other Pension Amount', type: 'number', required: false },
  ],
  ASSISTANCE: [
    { key: 'means_test_date', label: 'Means Test Date', type: 'date', required: true },
    { key: 'monthly_income', label: 'Monthly Income (EC$)', type: 'number', required: true },
    { key: 'means_test_passed', label: 'Means Test Passed', type: 'checkbox', required: false },
  ],
};

/**
 * Canonical detail fields for a product category. Unknown or missing
 * categories fall back to SHORT_TERM so a claim never renders an empty,
 * unexplained detail section.
 */
export function getCategoryDetailFields(category?: string | null): BenefitDetailFieldDef[] {
  if (!category) return CATEGORY_DETAIL_FIELDS.SHORT_TERM;
  const key = category.toUpperCase().replace(/[-\s.]/g, '_');
  return CATEGORY_DETAIL_FIELDS[key] ?? CATEGORY_DETAIL_FIELDS.SHORT_TERM;
}
