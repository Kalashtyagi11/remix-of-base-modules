import React from "react";
import { Link } from "react-router-dom";
import {
  Building2, Users, ShieldCheck, Workflow, Settings2, FileClock, Info, BookMarked, PackageCheck, Database,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type LinkItem = { label: string; to: string; description?: string };
type Group = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  links: LinkItem[];
};

const groups: Group[] = [
  {
    title: "Enterprise Configuration",
    icon: PackageCheck,
    description: "Setup & readiness centre — track configuration progress across shared domains, enterprise policy and product prerequisites.",
    links: [
      { label: "Configuration Centre", to: "/admin/configuration-centre" },
      { label: "SSB Implementation Setup", to: "/admin/ssb-setup" },
    ],
  },
  {
    title: "Organisation Foundation",
    icon: Building2,
    description: "Institution profile, offices, locations, departments, designations, calendar, and organisation defaults.",
    links: [
      { label: "Organisation Management", to: "/admin/org", description: "Foundation shell — organisation profile, locations, departments, modules, designations (Epic OM-4)." },
      { label: "Offices", to: "/admin/offices" },
      { label: "Departments", to: "/admin/departments" },
      { label: "Designations", to: "/admin/designations" },
      { label: "Organisation Profile", to: "/admin/organisation-profile" },
      { label: "Branding", to: "/admin/branding" },
      { label: "Calendar & Holidays", to: "/admin/calendar-holidays" },
    ],
  },
  {
    title: "Communication & Template Management",
    icon: BookMarked,
    description: "Media library, brand layouts, templates, notification templates, text blocks, tokens, channels, languages, and usage/impact validation.",
    links: [
      { label: "Communication & Template Management", to: "/admin/template-management", description: "Governed shell for communication assets, template library, advanced configuration, and validation/impact (Epic OM-4)." },
    ],
  },
  {
    title: "People & Access",
    icon: Users,
    description: "Enterprise user profile, staff assignment, role access, security state, and delegation management.",
    links: [
      { label: "Users", to: "/admin/users" },
      { label: "Create User", to: "/admin/users/create" },
      { label: "Roles & Permissions", to: "/admin/roles" },
      { label: "Delegations", to: "/admin/delegations" },
    ],
  },
  {
    title: "Platform Services",
    icon: Settings2,
    description: "Shared services every module consumes: notifications, templates, numbering and modules.",
    links: [
      { label: "Notifications", to: "/admin/notifications" },
      { label: "Notification Templates", to: "/admin/notification-templates" },
      { label: "Channels", to: "/admin/notifications/channels" },
      { label: "Providers", to: "/admin/notifications/providers" },
      { label: "Fiscal Calendar", to: "/admin/fiscal-calendar" },
      { label: "Numbering Rules", to: "/admin/numbering" },

      { label: "Reference Sequences", to: "/admin/numbering?tab=sequences" },
      { label: "Modules", to: "/admin/modules" },
      { label: "Module Button Bindings", to: "/admin/module-button-bindings" },
    ],
  },
  {
    title: "Security",
    icon: ShieldCheck,
    description: "Password policy, multi-factor authentication and IP access controls.",
    links: [
      { label: "Password Policy", to: "/admin/security/password-policy" },
      { label: "Multi-Factor Authentication", to: "/admin/security/mfa" },
      { label: "Security Policy", to: "/admin/security/policy" },
      { label: "IP Access Rules", to: "/admin/security/ip-access" },
      { label: "Permission Registry", to: "/admin/permission-registry", description: "Govern platform and module permission keys, lifecycle, risk, and RBAC synchronization." },
    ],
  },
  {
    title: "Operations",
    icon: Workflow,
    description: "Cross-module workflows, scheduling and runtime health.",
    links: [
      { label: "Workflow Management", to: "/admin/workflow-management" },
      { label: "Workflow Designer", to: "/admin/workflows" },
      { label: "Workflow Inbox", to: "/admin/workflow-inbox", description: "Review and act on assigned workflow tasks." },
      { label: "Triggers", to: "/admin/workflow-triggers" },
      { label: "Workflow Logs", to: "/admin/workflow-logs" },
      { label: "Workflow Analytics", to: "/admin/workflow-analytics" },
      { label: "Central Scheduler", to: "/admin/scheduler" },
      { label: "Session Health", to: "/admin/session-health" },
    ],
  },
  {
    title: "Shared Domains",
    icon: BookMarked,
    description: "Shared reference domains consumed by every business module.",
    links: [
      { label: "Geography", to: "/admin/geography" },
      { label: "Identity", to: "/admin/identity" },
      { label: "Financial Reference", to: "/admin/financial-reference" },
      { label: "Legal Reference", to: "/admin/legal-reference" },
      { label: "Participant / Party", to: "/admin/participant" },
      { label: "Communication & Correspondence", to: "/admin/communication-domain" },
      { label: "Document Repository (DMS)", to: "/admin/dms" },
      { label: "Document Configuration", to: "/admin/document-configuration" },
    ],
  },
  {
    title: "Enterprise Catalogue",
    icon: BookMarked,
    description: "Registry of every reusable enterprise capability across all products.",
    links: [
      { label: "Enterprise Service Catalogue", to: "/admin/platform/enterprise-catalogue" },
    ],
  },
  {
    title: "Governance",
    icon: FileClock,
    description: "Enterprise reference framework, system logs, consolidated audit trail and Administration route governance.",
    links: [
      { label: "Platform Service Catalogue", to: "/admin/platform-services", description: "Review reusable platform services, module contracts, integration readiness, and service health." },
      { label: "Release Readiness Dashboard", to: "/admin/release-readiness", description: "Aggregate route, table, permission, menu, audit, workflow, reference, migration and typecheck checks before shipping a release." },
      { label: "Reference Framework", to: "/admin/reference-framework" },
      { label: "System Logs", to: "/admin/logs" },
      { label: "Audit Log", to: "/admin/audit-log" },
      { label: "Audit Log (Legacy)", to: "/system-logs/audit" },
      { label: "Route Registry", to: "/admin/route-registry", description: "Govern canonical, legacy, redirect, retired and planned admin routes." },
      { label: "Table Registry", to: "/admin/table-registry", description: "Govern platform, module, migration, reporting and legacy table naming." },
    ],
  },
  {
    title: "Migration",
    icon: Database,
    description: "Old-to-new mapping dictionary for the PowerBuilder migration: tables, columns, values and relationships.",
    links: [
      { label: "Legacy Mapping", to: "/admin/legacy-mapping", description: "Map old PowerBuilder tables, columns, values, and relationships to modern platform names." },
      { label: "Migration Control Centre", to: "/admin/migration-control", description: "Plan, monitor, validate, reconcile, and approve PowerBuilder migration activities." },
    ],
  },
  {
    title: "Business Modules (Pilot)",
    icon: Building2,
    description: "Modern governed business-module screens rolling out in parallel with existing screens. Pilot users only.",
    links: [
      { label: "Employer Registry", to: "/admin/employer-registry", description: "Modern employer screen (pilot). Existing employer screens remain fully operational." },
    ],
  },
];

export default function PlatformAdmin() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Enterprise Administration"
        subtitle="Shared platform services used by every business module."
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Administration" },
          { label: "Platform" },
          { label: "Platform Admin" },
        ]}
      />

      <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
        <div>
          <div className="font-medium text-foreground">Platform Admin vs Setup Centre</div>
          <p className="text-muted-foreground">
            This is the technical control dashboard for shared platform services. For guided
            implementation setup use the <Link to="/admin/configuration-centre" className="text-primary hover:underline">Configuration Centre</Link>,
            and for St. Kitts SSB implementation policy use <Link to="/admin/ssb-setup" className="text-primary hover:underline">SSB Implementation Setup</Link>.
            Business-specific settings remain inside their respective modules.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => {
          const Icon = group.icon;
          return (
            <Card key={group.title} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">{group.title}</CardTitle>
                </div>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <ul className="space-y-1.5">
                  {group.links.map((link) => (
                    <li key={link.to}>
                      <Link
                        to={link.to}
                        className="text-sm text-primary hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
