import React from 'react';
import { PageShell } from '@/components/common';
import { ReportingConfigurationPanel } from '@/components/audit/settings/ReportingConfigurationPanel';

export default function ReportingConfiguration() {
  return (
    <PageShell
      title="Management Reporting Configuration"
      subtitle="Governed progress, schedule, plan-health, report structure and metric configuration — versioned and audited"
      breadcrumbs={[{ label: 'Internal Audit' }, { label: 'Reporting Configuration' }]}
    >
      <ReportingConfigurationPanel />
    </PageShell>
  );
}
