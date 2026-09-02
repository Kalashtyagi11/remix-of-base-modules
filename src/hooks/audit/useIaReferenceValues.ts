import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  createReferenceValue,
  getReferenceConfigurationHealth,
  listAllReferenceValues,
  listReferenceMigrationMap,
  listReferenceValues,
  setReferenceValueActive,
  updateReferenceValue,
  type IaReferenceTypeCode,
  type IaReferenceValue,
  type IaReferenceValueInput,
} from '@/services/audit/iaReferenceService';

const KEY = ['ia_reference_value'];

/**
 * Canonical governed reference values for an IA reference type.
 * `includeInactive` is used when rendering a historical record whose stored
 * value has since been retired — history must remain readable.
 */
export function useIaReferenceValues(
  type: IaReferenceTypeCode,
  opts?: { includeInactive?: boolean },
) {
  const includeInactive = !!opts?.includeInactive;
  return useQuery({
    queryKey: [...KEY, type, includeInactive],
    queryFn: () => listReferenceValues(type, { includeInactive }),
    staleTime: 5 * 60_000,
  });
}

/**
 * Options for a form control: active canonical values, plus the record's own
 * stored value when it is a retired reference (rendered as historical).
 */
export function useIaReferenceOptions(type: IaReferenceTypeCode, currentValue?: string | null) {
  const query = useIaReferenceValues(type, { includeInactive: true });
  const options = useMemo(() => {
    const all = query.data || [];
    return all.filter(
      (v) =>
        v.is_active ||
        (!!currentValue && (v.id === currentValue || v.name === currentValue || v.code === currentValue)),
    );
  }, [query.data, currentValue]);
  return { ...query, options };
}

export function useAllIaReferenceValues() {
  return useQuery({ queryKey: [...KEY, 'all'], queryFn: listAllReferenceValues, staleTime: 60_000 });
}

export function useIaReferenceMigrationMap() {
  return useQuery({ queryKey: [...KEY, 'migration-map'], queryFn: listReferenceMigrationMap, staleTime: 5 * 60_000 });
}

export function useIaReferenceConfigurationHealth() {
  return useQuery({
    queryKey: [...KEY, 'health'],
    queryFn: getReferenceConfigurationHealth,
    staleTime: 60_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateIaReferenceValue() {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: IaReferenceValueInput) => createReferenceValue(input),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Reference value created' });
    },
    onError: (e: any) =>
      toast({ title: 'Create failed', description: e?.message || 'Rejected by the server.', variant: 'destructive' }),
  });
}

export function useUpdateIaReferenceValue() {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; description?: string | null; display_order?: number } }) =>
      updateReferenceValue(id, patch),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Reference value updated' });
    },
    onError: (e: any) =>
      toast({ title: 'Update failed', description: e?.message || 'Rejected by the server.', variant: 'destructive' }),
  });
}

export function useSetIaReferenceValueActive() {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, isActive, reason }: { id: string; isActive: boolean; reason?: string }) =>
      setReferenceValueActive(id, isActive, reason),
    onSuccess: (_d, v) => {
      invalidate();
      toast({ title: v.isActive ? 'Reference value activated' : 'Reference value deactivated' });
    },
    onError: (e: any) =>
      toast({ title: 'Change failed', description: e?.message || 'Rejected by the server.', variant: 'destructive' }),
  });
}

export type { IaReferenceValue, IaReferenceTypeCode };
