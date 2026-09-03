/**
 * Epic 6 — Enterprise User Profile management page.
 *
 * Single guided screen with 4 simple sections + collapsible Advanced area.
 * Route: /admin/users/:userId/manage
 *
 * Design goal: keep this friendly. No database jargon, no 7-tab technical UI.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, ShieldCheck, ShieldAlert, Lock, Unlock, KeyRound, UserCheck, UserX,
  Briefcase, IdCard, ChevronDown, ChevronRight, Info,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

import { PermissionWrapper } from '@/components/ui/permission-wrapper';
import { useTbOffices, useDepartments } from '@/hooks/useAdminData';

import {
  useCoreUserProfile, useUpdateUserProfile,
  useStaffProfile, useCreateStaffProfile, useUpdateStaffProfile,
  useStaffAssignments, useCreateStaffAssignment, useSetPrimaryAssignment, useDeactivateStaffAssignment,
  useUserSecurityState,
  useLockUser, useUnlockUser, useDisableUser, useEnableUser, useRequirePasswordReset,
  useUserDelegations, useCreateUserDelegation, useRevokeUserDelegation,
  useIdentityUserRoles, useAssignIdentityRole, useRemoveIdentityRole, useAvailableRoles,
} from '@/platform/identity/useIdentity';
import { createOrUpdateUserSecurityState } from '@/platform/identity/identityService';

import {
  EMPLOYMENT_STATUSES, STAFF_TYPES, ASSIGNMENT_TYPES, DELEGATION_TYPES,
} from '@/platform/identity/identityTypes';

const HIGH_RISK_ROLES = new Set(['Admin', 'admin', 'SuperAdmin', 'super_admin']);

function StatusBadge({ status }: { status?: string | null }) {
  const map: Record<string, string> = {
    ACTIVE: 'default', LOCKED: 'destructive', SUSPENDED: 'destructive',
    DISABLED: 'secondary', PASSWORD_RESET_REQUIRED: 'outline',
    PENDING_ACTIVATION: 'outline',
  };
  const label = (status ?? 'ACTIVE').replace(/_/g, ' ').toLowerCase();
  return <Badge variant={(map[status ?? 'ACTIVE'] as any) ?? 'default'} className="capitalize">{label}</Badge>;
}

function Section({
  title, description, right, children,
}: { title: string; description?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {right}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

const UserManageContent = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const { data: profile, isLoading: profileLoading } = useCoreUserProfile(userId);
  const { data: staff } = useStaffProfile(userId);
  const { data: assignments = [] } = useStaffAssignments(userId);
  const { data: security } = useUserSecurityState(userId);
  const { data: delegations = [] } = useUserDelegations(userId);
  const { data: userRoles = [] } = useIdentityUserRoles(userId);
  const { data: availableRoles = [] } = useAvailableRoles();
  const { data: offices = [] } = useTbOffices();

  const [officeCode, setOfficeCode] = useState<string>('');
  const { data: departments = [] } = useDepartments(officeCode || profile?.office_code || '');

  const updateProfile = useUpdateUserProfile();
  const createStaff = useCreateStaffProfile();
  const updateStaff = useUpdateStaffProfile();
  const createAssignment = useCreateStaffAssignment();
  const setPrimary = useSetPrimaryAssignment();
  const deactivateAssignment = useDeactivateStaffAssignment();
  const lockUser = useLockUser();
  const unlockUser = useUnlockUser();
  const disableUser = useDisableUser();
  const enableUser = useEnableUser();
  const requireReset = useRequirePasswordReset();
  const assignRole = useAssignIdentityRole();
  const removeRole = useRemoveIdentityRole();
  const createDelegation = useCreateUserDelegation();
  const revokeDelegation = useRevokeUserDelegation();

  const [basic, setBasic] = useState<Record<string, string>>({});
  const [work, setWork] = useState<Record<string, string>>({});
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showDelegationDialog, setShowDelegationDialog] = useState(false);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [reasonText, setReasonText] = useState('');

  const currentAssignment = useMemo(
    () => assignments.find((a) => a.is_primary && a.is_active) ?? assignments[0],
    [assignments],
  );

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (!staff) w.push('This user does not have a staff profile yet.');
    if (assignments.length > 0 && !assignments.some((a) => a.is_primary && a.is_active))
      w.push('This user does not have a primary work assignment.');
    const primaries = assignments.filter((a) => a.is_primary && a.is_active).length;
    if (primaries > 1) w.push('This user has multiple active primary assignments.');
    if (profile?.is_active && security?.is_disabled)
      w.push('This user is active on the profile but disabled in security state.');
    if (userRoles.some((r) => HIGH_RISK_ROLES.has(r)) && !(security?.mfa_enabled ?? profile?.mfa_enabled))
      w.push('This user has a high-risk role. Consider enabling MFA.');
    const now = Date.now();
    if (delegations.some((d) => new Date(d.effective_to).getTime() < now && d.is_active))
      w.push('This user has an expired delegation still marked active.');
    return w;
  }, [staff, assignments, profile, security, userRoles, delegations]);

  if (!userId) return null;
  if (profileLoading || !profile) {
    return <div className="p-8 text-sm text-muted-foreground">Loading user…</div>;
  }

  const b = (k: string, fallback?: string | null) => basic[k] ?? (fallback ?? '');
  const w = (k: string, fallback?: string | null) => work[k] ?? (fallback ?? '');

  const handleSaveBasic = async () => {
    await updateProfile.mutateAsync({
      userId,
      payload: {
        title: b('title', profile.title) || null,
        first_name: b('first_name', profile.first_name) || null,
        middle_name: b('middle_name', profile.middle_name) || null,
        last_name: b('last_name', profile.last_name) || null,
        full_name: b('full_name', profile.full_name) || null,
        email: b('email', profile.email) || null,
        phone: b('phone', profile.phone) || null,
        gender: b('gender', profile.gender) || null,
        date_of_birth: b('date_of_birth', profile.date_of_birth) || null,
        employee_code: b('employee_code', profile.employee_code) || null,
      },
    });
    toast.success('Basic information updated');
    setBasic({});
  };

  const handleSaveWork = async () => {
    const office = w('office_code', profile.office_code) || null;
    const dept = w('department_id', profile.department_id) || null;
    await updateProfile.mutateAsync({
      userId,
      payload: { office_code: office, department_id: dept },
    });
    // Extend into staff profile
    const staffPayload = {
      user_id: userId,
      employment_status: (w('employment_status', staff?.employment_status) as any) || 'ACTIVE',
      staff_type: (w('staff_type', staff?.staff_type) as any) || 'PERMANENT',
    };
    if (staff) await updateStaff.mutateAsync({ id: staff.id, payload: staffPayload });
    else await createStaff.mutateAsync(staffPayload);
    toast.success('Work & assignment updated');
    setWork({});
  };

  const handleCreateStaff = async () => {
    if (!staff) {
      await createStaff.mutateAsync({
        user_id: userId,
        first_name: profile.first_name,
        last_name: profile.last_name,
        display_name: profile.full_name,
        employee_code: profile.employee_code,
        employment_status: 'ACTIVE',
        staff_type: 'PERMANENT',
      });
      toast.success('Staff profile created');
    }
  };

  const handleToggleRole = async (role: string) => {
    if (userRoles.includes(role)) {
      await removeRole.mutateAsync({ userId, role });
      toast.success(`Removed role: ${role}`);
    } else {
      await assignRole.mutateAsync({ userId, role });
      toast.success(`Assigned role: ${role}`);
    }
  };

  const currentStatus = security?.account_status ?? (profile.is_active ? 'ACTIVE' : 'DISABLED');

  return (
    <div className="container max-w-6xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Users
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              {profile.full_name || profile.email}
              <StatusBadge status={currentStatus} />
              {(security?.mfa_enabled ?? profile.mfa_enabled) && (
                <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" />MFA</Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Things to check</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              {warnings.map((msg) => <li key={msg}>{msg}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* 1. Basic Information */}
      <Section
        title="Basic Information"
        description="Standard user profile — identity and contact details."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Title</Label>
            <Input value={b('title', profile.title)} onChange={(e) => setBasic({ ...basic, title: e.target.value })} />
          </div>
          <div>
            <Label>First Name</Label>
            <Input value={b('first_name', profile.first_name)} onChange={(e) => setBasic({ ...basic, first_name: e.target.value })} />
          </div>
          <div>
            <Label>Middle Name</Label>
            <Input value={b('middle_name', profile.middle_name)} onChange={(e) => setBasic({ ...basic, middle_name: e.target.value })} />
          </div>
          <div>
            <Label>Last Name</Label>
            <Input value={b('last_name', profile.last_name)} onChange={(e) => setBasic({ ...basic, last_name: e.target.value })} />
          </div>
          <div>
            <Label>Display / Full Name</Label>
            <Input value={b('full_name', profile.full_name)} onChange={(e) => setBasic({ ...basic, full_name: e.target.value })} />
          </div>
          <div>
            <Label>Employee Code</Label>
            <Input value={b('employee_code', profile.employee_code)} onChange={(e) => setBasic({ ...basic, employee_code: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={b('email', profile.email)} onChange={(e) => setBasic({ ...basic, email: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={b('phone', profile.phone)} onChange={(e) => setBasic({ ...basic, phone: e.target.value })} />
          </div>
          <div>
            <Label>Gender</Label>
            <Select value={b('gender', profile.gender)} onValueChange={(v) => setBasic({ ...basic, gender: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Male</SelectItem>
                <SelectItem value="F">Female</SelectItem>
                <SelectItem value="N">Not-Specified</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date of Birth</Label>
            <Input type="date" value={b('date_of_birth', profile.date_of_birth)}
              onChange={(e) => setBasic({ ...basic, date_of_birth: e.target.value })} />
          </div>
          <div className="flex items-end gap-3">
            <Badge variant={profile.is_active ? 'default' : 'secondary'}>
              {profile.is_active ? 'Active profile' : 'Inactive profile'}
            </Badge>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSaveBasic} disabled={Object.keys(basic).length === 0}>
            Save Basic Info
          </Button>
        </div>
      </Section>

      {/* 2. Work & Assignment */}
      <Section
        title="Work & Assignment"
        description="Office, department, and employment details."
        right={
          !staff ? (
            <Button size="sm" variant="outline" onClick={handleCreateStaff}>
              <Briefcase className="h-4 w-4 mr-1" /> Create Staff Profile
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Office</Label>
            <Select
              value={w('office_code', profile.office_code)}
              onValueChange={(v) => { setWork({ ...work, office_code: v, department_id: '' }); setOfficeCode(v); }}
            >
              <SelectTrigger><SelectValue placeholder="Select office" /></SelectTrigger>
              <SelectContent>
                {offices.map((o: any) => (
                  <SelectItem key={o.code} value={o.code}>{o.description || o.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Department</Label>
            <Select value={w('department_id', profile.department_id)}
              onValueChange={(v) => setWork({ ...work, department_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Employment Status</Label>
            <Select value={w('employment_status', staff?.employment_status)}
              onValueChange={(v) => setWork({ ...work, employment_status: v })}>
              <SelectTrigger><SelectValue placeholder="Active" /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Staff Type</Label>
            <Select value={w('staff_type', staff?.staff_type)}
              onValueChange={(v) => setWork({ ...work, staff_type: v })}>
              <SelectTrigger><SelectValue placeholder="Permanent" /></SelectTrigger>
              <SelectContent>
                {STAFF_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {currentAssignment && (
          <div className="rounded-md border p-3 text-sm bg-muted/40">
            <div className="font-medium">Current assignment</div>
            <div className="text-muted-foreground">
              {currentAssignment.office_code || '—'} · {currentAssignment.assignment_type} ·
              {' '}from {currentAssignment.effective_from}
              {currentAssignment.effective_to ? ` to ${currentAssignment.effective_to}` : ' (open)'}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowAssignmentDialog(true)} disabled={!staff}>
            + New Assignment
          </Button>
          <Button onClick={handleSaveWork} disabled={Object.keys(work).length === 0}>
            Save Work & Assignment
          </Button>
        </div>
      </Section>

      {/* 3. Roles & Access */}
      <Section
        title="Roles & Access"
        description="Assign roles from the platform role registry."
      >
        <div className="flex flex-wrap gap-2">
          {availableRoles.length === 0 && (
            <p className="text-sm text-muted-foreground">No roles configured yet.</p>
          )}
          {availableRoles.map((r) => {
            const assigned = userRoles.includes(r);
            return (
              <Button
                key={r}
                size="sm"
                variant={assigned ? 'default' : 'outline'}
                onClick={() => handleToggleRole(r)}
              >
                {assigned ? <UserCheck className="h-4 w-4 mr-1" /> : <UserX className="h-4 w-4 mr-1" />}
                {r}
              </Button>
            );
          })}
        </div>
      </Section>

      {/* 4. Security */}
      <Section
        title="Security"
        description="Simple account controls. Advanced details are below."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Account Status</div>
            <div className="mt-1"><StatusBadge status={currentStatus} /></div>
          </div>
          <div className="rounded-md border p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">MFA Required</div>
              <div className="text-xs text-muted-foreground">Force MFA for this user</div>
            </div>
            <Switch
              checked={!!security?.mfa_required}
              onCheckedChange={async (v) => {
                await createOrUpdateUserSecurityState(userId, { mfa_required: v });

                toast.success(`MFA requirement ${v ? 'enabled' : 'disabled'}`);
              }}
            />
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Failed logins</div>
            <div className="text-sm font-medium mt-1">
              {security?.failed_login_count ?? profile.failed_login_attempts ?? 0}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {security?.is_locked ? (
            <Button variant="outline" size="sm" onClick={() => unlockUser.mutate(userId, { onSuccess: () => toast.success('User unlocked') })}>
              <Unlock className="h-4 w-4 mr-1" /> Unlock
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowLockDialog(true)}>
              <Lock className="h-4 w-4 mr-1" /> Lock
            </Button>
          )}
          {security?.is_disabled ? (
            <Button variant="outline" size="sm" onClick={() => enableUser.mutate(userId, { onSuccess: () => toast.success('User enabled') })}>
              <UserCheck className="h-4 w-4 mr-1" /> Enable
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setShowDisableDialog(true)}>
              <UserX className="h-4 w-4 mr-1" /> Disable
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowResetDialog(true)}>
            <KeyRound className="h-4 w-4 mr-1" /> Require Password Reset
          </Button>
        </div>
      </Section>

      {/* Advanced */}
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-start">
            <ChevronRight className="h-4 w-4 mr-2 transition-transform data-[state=open]:rotate-90" />
            Advanced — Assignment history, Delegations, Security details, Audit history
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 mt-2">
          <Section title="Assignment History" description="All assignments over time.">
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Office</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Primary</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">No assignments yet.</TableCell></TableRow>
                  )}
                  {assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.office_code || '—'}</TableCell>
                      <TableCell className="text-xs">{a.department_id?.slice(0, 8) || '—'}</TableCell>
                      <TableCell><Badge variant="outline">{a.assignment_type}</Badge></TableCell>
                      <TableCell><StatusBadge status={a.assignment_status} /></TableCell>
                      <TableCell>{a.effective_from}</TableCell>
                      <TableCell>{a.effective_to ?? '—'}</TableCell>
                      <TableCell>{a.is_primary ? <Badge>Primary</Badge> : ''}</TableCell>
                      <TableCell className="text-right space-x-1">
                        {!a.is_primary && a.is_active && (
                          <Button variant="ghost" size="sm" onClick={() => setPrimary.mutate(a.id, { onSuccess: () => toast.success('Set as primary') })}>
                            Set Primary
                          </Button>
                        )}
                        {a.is_active && (
                          <Button variant="ghost" size="sm" onClick={() => deactivateAssignment.mutate(a.id, { onSuccess: () => toast.success('Assignment ended') })}>
                            End
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section
            title="Delegations"
            description="Delegations granted to other users on behalf of this user."
            right={<Button size="sm" onClick={() => setShowDelegationDialog(true)}>+ New Delegation</Button>}
          >
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Delegate</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {delegations.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">No delegations.</TableCell></TableRow>
                  )}
                  {delegations.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs">{d.delegate_user_id.slice(0, 8)}</TableCell>
                      <TableCell><Badge variant="outline">{d.delegation_type}</Badge></TableCell>
                      <TableCell className="text-xs">{d.scope_module_code || d.scope_permission_key || 'General'}</TableCell>
                      <TableCell>{new Date(d.effective_from).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(d.effective_to).toLocaleDateString()}</TableCell>
                      <TableCell><StatusBadge status={d.approval_status} /></TableCell>
                      <TableCell className="text-right">
                        {d.is_active && d.approval_status !== 'REVOKED' && (
                          <Button variant="ghost" size="sm" onClick={() => {
                            const reason = window.prompt('Reason for revoking?') || 'Revoked by admin';
                            revokeDelegation.mutate({ id: d.id, reason }, { onSuccess: () => toast.success('Delegation revoked') });
                          }}>Revoke</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section title="Security Details" description="Full security state fields.">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-muted-foreground">Account status: </span>{security?.account_status ?? '—'}</div>
              <div><span className="text-muted-foreground">Locked: </span>{security?.is_locked ? 'Yes' : 'No'}</div>
              <div><span className="text-muted-foreground">Suspended: </span>{security?.is_suspended ? 'Yes' : 'No'}</div>
              <div><span className="text-muted-foreground">Disabled: </span>{security?.is_disabled ? 'Yes' : 'No'}</div>
              <div><span className="text-muted-foreground">MFA required: </span>{security?.mfa_required ? 'Yes' : 'No'}</div>
              <div><span className="text-muted-foreground">MFA enabled: </span>{(security?.mfa_enabled ?? profile.mfa_enabled) ? 'Yes' : 'No'}</div>
              <div><span className="text-muted-foreground">Password reset required: </span>{security?.password_reset_required ? 'Yes' : 'No'}</div>
              <div><span className="text-muted-foreground">Last login: </span>{profile.last_login ? new Date(profile.last_login).toLocaleString() : '—'}</div>
              {security?.locked_reason && <div className="col-span-full"><span className="text-muted-foreground">Locked reason: </span>{security.locked_reason}</div>}
              {security?.disabled_reason && <div className="col-span-full"><span className="text-muted-foreground">Disabled reason: </span>{security.disabled_reason}</div>}
              {security?.suspended_reason && <div className="col-span-full"><span className="text-muted-foreground">Suspended reason: </span>{security.suspended_reason}</div>}
            </div>
          </Section>

          <Section title="Audit History" description="Recent activity for this user.">
            <p className="text-sm text-muted-foreground">
              Audit history will be standardized in Epic 8. Existing audit events remain accessible via the platform Audit page.
            </p>
          </Section>
        </CollapsibleContent>
      </Collapsible>

      {/* -------- Dialogs -------- */}

      <Dialog open={showLockDialog} onOpenChange={setShowLockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lock User</DialogTitle>
            <DialogDescription>Provide a reason. The user won't be able to sign in.</DialogDescription>
          </DialogHeader>
          <Textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Reason" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowLockDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              await lockUser.mutateAsync({ userId, reason: reasonText || 'Locked by admin' });
              setShowLockDialog(false); setReasonText(''); toast.success('User locked');
            }}>Lock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable User</DialogTitle>
            <DialogDescription>Provide a reason.</DialogDescription>
          </DialogHeader>
          <Textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Reason" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDisableDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              await disableUser.mutateAsync({ userId, reason: reasonText || 'Disabled by admin' });
              setShowDisableDialog(false); setReasonText(''); toast.success('User disabled');
            }}>Disable</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Require Password Reset</DialogTitle>
            <DialogDescription>The user will be asked to reset their password on next sign-in.</DialogDescription>
          </DialogHeader>
          <Textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Reason" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button onClick={async () => {
              await requireReset.mutateAsync({ userId, reason: reasonText || 'Admin required reset' });
              setShowResetDialog(false); setReasonText(''); toast.success('Password reset required');
            }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewDelegationDialog
        open={showDelegationDialog}
        onOpenChange={setShowDelegationDialog}
        delegatorUserId={userId}
        onCreate={async (payload) => {
          await createDelegation.mutateAsync(payload);
          toast.success('Delegation created');
        }}
      />

      <NewAssignmentDialog
        open={showAssignmentDialog}
        onOpenChange={setShowAssignmentDialog}
        userId={userId}
        staffProfileId={staff?.id}
        offices={offices}
        onCreate={async (payload) => {
          await createAssignment.mutateAsync(payload);
          toast.success('Assignment created');
        }}
      />
    </div>
  );
};

/* ---------- inline dialogs ---------- */

function NewDelegationDialog({
  open, onOpenChange, delegatorUserId, onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  delegatorUserId: string;
  onCreate: (payload: any) => Promise<void>;
}) {
  const [form, setForm] = useState({
    delegate_user_id: '',
    delegation_type: 'GENERAL',
    scope_module_code: '',
    scope_permission_key: '',
    effective_from: new Date().toISOString().slice(0, 16),
    effective_to: new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 16),
    reason: '',
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Delegation</DialogTitle>
          <DialogDescription>Grant temporary authority to another user.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label>Delegate User ID</Label>
            <Input value={form.delegate_user_id} onChange={(e) => setForm({ ...form, delegate_user_id: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.delegation_type} onValueChange={(v) => setForm({ ...form, delegation_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELEGATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Scope Module (optional)</Label>
              <Input value={form.scope_module_code} onChange={(e) => setForm({ ...form, scope_module_code: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Effective From</Label>
              <Input type="datetime-local" value={form.effective_from}
                onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
            </div>
            <div>
              <Label>Effective To</Label>
              <Input type="datetime-local" value={form.effective_to}
                onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!form.delegate_user_id || form.delegate_user_id === delegatorUserId}
            onClick={async () => {
              await onCreate({
                delegator_user_id: delegatorUserId,
                delegate_user_id: form.delegate_user_id,
                delegation_type: form.delegation_type,
                scope_module_code: form.scope_module_code || null,
                scope_permission_key: form.scope_permission_key || null,
                effective_from: new Date(form.effective_from).toISOString(),
                effective_to: new Date(form.effective_to).toISOString(),
                approval_status: 'APPROVED',
                reason: form.reason || null,
                is_active: true,
              });
              onOpenChange(false);
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewAssignmentDialog({
  open, onOpenChange, userId, staffProfileId, offices, onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  staffProfileId?: string;
  offices: any[];
  onCreate: (payload: any) => Promise<void>;
}) {
  const [form, setForm] = useState({
    office_code: '',
    assignment_type: 'PRIMARY',
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: '',
    is_primary: true,
    reason: '',
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Assignment</DialogTitle>
          <DialogDescription>Assign office and effective dates.</DialogDescription>
        </DialogHeader>
        {!staffProfileId && (
          <Alert><AlertDescription>Create a staff profile first to add assignments.</AlertDescription></Alert>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Office</Label>
            <Select value={form.office_code} onValueChange={(v) => setForm({ ...form, office_code: v })}>
              <SelectTrigger><SelectValue placeholder="Select office" /></SelectTrigger>
              <SelectContent>
                {offices.map((o) => <SelectItem key={o.code} value={o.code}>{o.description || o.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.assignment_type} onValueChange={(v) => setForm({ ...form, assignment_type: v, is_primary: v === 'PRIMARY' })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Effective From</Label>
            <Input type="date" value={form.effective_from}
              onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
          </div>
          <div>
            <Label>Effective To (optional)</Label>
            <Input type="date" value={form.effective_to}
              onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Reason</Label>
            <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!staffProfileId || !form.office_code}
            onClick={async () => {
              await onCreate({
                staff_profile_id: staffProfileId!,
                user_id: userId,
                office_code: form.office_code,
                assignment_type: form.assignment_type,
                assignment_status: 'ACTIVE',
                effective_from: form.effective_from,
                effective_to: form.effective_to || null,
                is_primary: form.is_primary,
                reason: form.reason || null,
                is_active: true,
              });
              onOpenChange(false);
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UserProfileManageAdmin() {
  return (
    <PermissionWrapper moduleName="user_management">
      <UserManageContent />
    </PermissionWrapper>
  );
}
