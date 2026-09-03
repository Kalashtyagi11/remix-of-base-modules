import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  createFiscalYear,
  isPlanningEligible,
  listFiscalYears,
  setFiscalYearActive,
  setFiscalYearStatus,
  updateFiscalYear,
  type FiscalYear,
  type FiscalYearInput,
  type FiscalYearStatus,
} from '@/services/core/fiscalCalendarService';

const KEY = ['core_fiscal_year'];

export function useFiscalYears() {
  return useQuery({
    queryKey: KEY,
    queryFn: listFiscalYears,
    staleTime: 60_000,
  });
}

/** Fiscal years that may back NEW planning work. */
export function usePlanningEligibleFiscalYears() {
  const query = useFiscalYears();
  const eligible = useMemo(
    () => (query.data || []).filter(isPlanningEligible),
    [query.data],
  );
  return { ...query, data: eligible };
}

export function useFiscalYearMap() {
  const { data } = useFiscalYears();
  return useMemo(() => {
    const map = new Map<string, FiscalYear>();
    (data || []).forEach((fy) => map.set(fy.id, fy));
    return map;
  }, [data]);
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ['ia_annual_plans'] });
  };
}

export function useCreateFiscalYear() {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: FiscalYearInput) => createFiscalYear(input),
    onSuccess: (fy) => {
      invalidate();
      toast({ title: 'Fiscal Year Created', description: `${fy.code} is now available for selection.` });
    },
    onError: (e: any) =>
      toast({ title: 'Create Failed', description: e?.message || 'Could not create the fiscal year.', variant: 'destructive' }),
  });
}

export function useUpdateFiscalYear() {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<FiscalYearInput> }) =>
      updateFiscalYear(id, patch),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Fiscal Year Updated' });
    },
    onError: (e: any) =>
      toast({ title: 'Update Failed', description: e?.message || 'Could not update the fiscal year.', variant: 'destructive' }),
  });
}

export function useSetFiscalYearActive() {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setFiscalYearActive(id, isActive),
    onSuccess: (_d, v) => {
      invalidate();
      toast({ title: v.isActive ? 'Fiscal Year Activated' : 'Fiscal Year Deactivated' });
    },
    onError: (e: any) =>
      toast({ title: 'Action Failed', description: e?.message || 'Could not change the fiscal year.', variant: 'destructive' }),
  });
}

export function useSetFiscalYearStatus() {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: FiscalYearStatus }) =>
      setFiscalYearStatus(id, status),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Fiscal Year Status Updated' });
    },
    onError: (e: any) =>
      toast({ title: 'Action Failed', description: e?.message || 'Could not change the status.', variant: 'destructive' }),
  });
}
