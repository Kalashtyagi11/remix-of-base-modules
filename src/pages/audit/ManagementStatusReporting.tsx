import React from 'react';
import { PageShell } from '@/components/common';
import { ManagementStatusPanel } from '@/components/audit/reports/managementStatus/ManagementStatusPanel';

export default function ManagementStatusReporting() {
  return (
    <PageShell
      title="Audit Plan Status & Management Report"
      subtitle="Governed live plan status and immutable point-in-time reports for HIA, executive management and the Audit / Risk Committee"
      breadcrumbs={[{ label: 'Internal Audit' }, { label: 'Plan Status & Management Report' }]}
    >
      <ManagementStatusPanel />
    </PageShell>
  );
}
