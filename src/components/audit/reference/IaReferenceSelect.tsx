/**
 * IaReferenceSelect — the ONLY UI source for governed Internal Audit
 * classifications (Audit Type, Coverage Category, Follow-Up Type).
 *
 * Hardcoded arrays are forbidden for these concepts (DEF-E2E-007/008). The
 * control is a convenience surface only: the server re-validates every value
 * against ia_reference_value and rejects unknown, inactive, wrong-type or
 * semantically invalid (risk band) submissions.
 *
 * The stored value is the canonical display name, which the server normalises
 * to the canonical reference id on write. Retired values remain selectable ONLY
 * when they are the value already stored on the record being viewed, so history
 * stays readable while new transactions must use active canonical values.
 */
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useIaReferenceOptions, type IaReferenceTypeCode } from '@/hooks/audit/useIaReferenceValues';

interface Props {
  type: IaReferenceTypeCode;
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  className?: string;
  id?: string;
}

export const IA_REFERENCE_CLEAR = '__none__';

export const IaReferenceSelect: React.FC<Props> = ({
  type, value, onChange, placeholder = 'Select…', disabled,
  allowClear, clearLabel = 'Not specified', className, id,
}) => {
  const { options, isLoading, isError, error } = useIaReferenceOptions(type, value);

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive border rounded-md px-3 py-2">
        <AlertTriangle className="h-3.5 w-3.5" />
        Reference list unavailable{error instanceof Error ? `: ${error.message}` : ''}
      </div>
    );
  }

  return (
    <Select
      value={value || (allowClear ? IA_REFERENCE_CLEAR : '')}
      onValueChange={(v) => onChange(v === IA_REFERENCE_CLEAR ? '' : v)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={className} id={id}>
        {isLoading
          ? <span className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</span>
          : <SelectValue placeholder={placeholder} />}
      </SelectTrigger>
      <SelectContent>
        {allowClear && <SelectItem value={IA_REFERENCE_CLEAR}>{clearLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.name}>
            {o.name}{!o.is_active ? ' (retired)' : ''}
          </SelectItem>
        ))}
        {!isLoading && options.length === 0 && (
          <SelectItem value="__empty__" disabled>No active values configured</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
};

export default IaReferenceSelect;
