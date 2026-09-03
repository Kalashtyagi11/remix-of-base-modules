/**
 * Claim Workbench — Section 6: Benefit-Specific Detail
 *
 * Source precedence (most → least authoritative for display):
 *   1. local in-memory edits (workbench)
 *   2. bn_claim_detail.detail_json (staff captured)
 *   3. bn_claim_application.raw_application_json.benefit_facts (citizen)
 *
 * Editability is driven by the central field ownership registry — citizen
 * fields are always read-only here, staff fields are editable only in the
 * correct status with the correct role, system-derived fields are locked.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Stethoscope, Lock, User, ShieldCheck, Cpu } from 'lucide-react';
import { formatDateForDisplay } from '@/lib/format-config';
import {
  isFieldEditable,
  type FieldOwnership,
} from '@/lib/bn/fieldOwnership';
import { BENEFIT_FIELDS, normalizeBenefitKey } from '@/services/bn/forms/sectionCatalogue';
import {
  getCategoryDetailFields,
  type BenefitDetailFieldType,
} from '@/services/bn/forms/benefitDetailFields';

interface BenefitDetailSectionProps {
  category: string;
  detailJson: Record<string, any> | null;
  /** Current claim status — drives editability windows. */
  claimStatus: string;
  /** Roles of the current user — drives editability gates. */
  roles: string[];
  /** Product / benefit code — overlays the product's own captured fields. */
  productCode?: string | null;
  onDetailChange: (key: string, value: any) => void;
}

type FieldDef = {
  key: string;
  label: string;
  type: BenefitDetailFieldType;
  required: boolean;
};


const OWNERSHIP_BADGE: Record<FieldOwnership, { label: string; className: string; Icon: React.ElementType }> = {
  CITIZEN_SUBMITTED: {
    label: 'Citizen',
    className: 'bg-blue-500/10 text-blue-700 border-blue-300',
    Icon: User,
  },
  STAFF_REVIEW: {
    label: 'Staff',
    className: 'bg-amber-500/10 text-amber-700 border-amber-300',
    Icon: ShieldCheck,
  },
  SUPERVISOR_DECISION: {
    label: 'Supervisor',
    className: 'bg-purple-500/10 text-purple-700 border-purple-300',
    Icon: ShieldCheck,
  },
  SYSTEM_DERIVED: {
    label: 'System',
    className: 'bg-muted text-muted-foreground border-border',
    Icon: Cpu,
  },
};

const FIELD_TYPE_MAP: Record<string, FieldDef['type']> = {
  DATE: 'date',
  TEXT: 'text',
  NUMBER: 'number',
  CHECKBOX: 'checkbox',
};

export const BenefitDetailSection: React.FC<BenefitDetailSectionProps> = ({
  category,
  detailJson,
  claimStatus,
  roles,
  productCode,
  onDetailChange,
}) => {
  const fields = React.useMemo<FieldDef[]>(() => {
    const base = getCategoryDetailFields(category);
    const benefitKey = normalizeBenefitKey(productCode);
    const productFields = benefitKey ? BENEFIT_FIELDS[benefitKey] ?? [] : [];
    if (productFields.length === 0) return base;

    const seen = new Set(base.map((f) => f.key));
    const overlay: FieldDef[] = [];
    for (const f of productFields) {
      if (seen.has(f.field_code)) continue;
      seen.add(f.field_code);
      overlay.push({
        key: f.field_code,
        label: f.field_label,
        type: FIELD_TYPE_MAP[String(f.field_type).toUpperCase()] ?? 'text',
        required: false,
      });
    }
    return [...base, ...overlay];
  }, [category, productCode]);

  const data = detailJson || {};
  const hasAnyValue = React.useMemo(
    () => fields.some((f) => {
      const v = data[f.key];
      return v !== undefined && v !== null && v !== '';
    }),
    [fields, data],
  );


  return (
    <TooltipProvider delayDuration={150}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Stethoscope className="h-4 w-4" /> Benefit-Specific Details
            <span className="text-xs text-muted-foreground font-normal">({category})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fields.length > 0 && !hasAnyValue && (
            <div className="mb-4 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              No benefit-specific data was captured at registration for this claim.
              Enter the values below and save — they are stored against the claim.
            </div>
          )}
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No benefit-specific fields defined for this category.</p>
          ) : (

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fields.map((field) => {
                const decision = isFieldEditable({
                  category,
                  fieldKey: field.key,
                  claimStatus,
                  roles,
                });
                const badge = OWNERSHIP_BADGE[decision.ownership];
                const BadgeIcon = badge.Icon;
                const editable = decision.editable;
                const value = data[field.key];

                const labelRow = (
                  <div className="flex items-center gap-2 mb-1">
                    <Label className="text-xs text-muted-foreground">
                      {field.label}
                      {field.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className={`gap-1 px-1.5 py-0 text-[10px] ${badge.className}`}>
                          <BadgeIcon className="h-2.5 w-2.5" />
                          {badge.label}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{decision.reason}</TooltipContent>
                    </Tooltip>
                    {!editable && (
                      <Lock className="h-3 w-3 text-muted-foreground/60" aria-label="read-only" />
                    )}
                  </div>
                );

                if (field.type === 'checkbox') {
                  return (
                    <div key={field.key} className="flex flex-col gap-1 pt-1">
                      {labelRow}
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={field.key}
                          checked={!!value}
                          onCheckedChange={(v) => editable && onDetailChange(field.key, v)}
                          disabled={!editable}
                        />
                        <Label htmlFor={field.key} className="text-sm">
                          {value ? 'Yes' : 'No'}
                        </Label>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={field.key}>
                    {labelRow}
                    {editable ? (
                      <Input
                        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                        value={value ?? ''}
                        onChange={(e) =>
                          onDetailChange(
                            field.key,
                            field.type === 'number' ? Number(e.target.value) : e.target.value,
                          )
                        }
                      />
                    ) : (
                      <p className="text-foreground text-sm border rounded px-2 py-1.5 bg-muted/30">
                        {field.type === 'date' && value
                          ? formatDateForDisplay(value)
                          : value === true
                            ? 'Yes'
                            : value === false
                              ? 'No'
                              : (value ?? '—')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-4 border-t pt-3">
            Stored in: bn_claim_detail.detail_json. Citizen-submitted values stay in bn_claim_application.raw_application_json and are never overwritten by Save.
          </p>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};
