import { describe, it, expect } from 'vitest';
import { generateScheduleRows } from '@/services/bn/scheduleService';

const base = {
  entitlementId: 'ent-1',
  awardId: 'award-1',
  claimId: 'claim-1',
  ssn: '123456789',
  claimNumber: 'CLM-1',
  startDate: '2026-01-05',
  endDate: null,
  weeklyRate: 255,
  monthlyRate: 1105,
  totalEntitlement: 3060,
  mode: 'INITIAL' as const,
  performedBy: 'TESTER',
};

describe('generateScheduleRows required columns', () => {
  it.each(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ONE_TIME'] as const)(
    'emits award, schedule period and gross amount for %s',
    (frequency) => {
      const rows = generateScheduleRows({ ...base, frequency, maxPeriods: 12 });
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.bn_award_id).toBe('award-1');
        expect(r.schedule_period).toBe(r.period_start);
        expect(r.gross_amount).toBe(r.amount);
        expect(r.due_date).toBeTruthy();
      }
    },
  );
});
