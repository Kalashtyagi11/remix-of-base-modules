import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useChecklistTemplates(departmentId?: string) {
  return useQuery({
    queryKey: ['ia_checklist_templates', departmentId],
    queryFn: async () => {
      let query = supabase
        .from('ia_checklist_templates' as any)
        .select('*, ia_checklist_template_items(count)')
        .eq('is_active', true)
        .order('template_name');

      const { data, error } = await query;
      if (error) throw error;

      // Sort: department-specific first, then general
      const items = ((data ?? []) as any[]).map((t: any) => ({
        ...t,
        item_count: t.ia_checklist_template_items?.[0]?.count ?? 0,
      }));

      if (departmentId) {
        return [
          ...items.filter((t: any) => t.department_id === departmentId),
          ...items.filter((t: any) => t.department_id !== departmentId),
        ];
      }
      return items;
    },
  });
}

export function useChecklistTemplateItems(templateId?: string) {
  return useQuery({
    queryKey: ['ia_checklist_template_items', templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ia_checklist_template_items' as any)
        .select('*')
        .eq('template_id', templateId!)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!templateId,
  });
}

export function useLoadChecklistTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ auditId, templateId }: { auditId: string; templateId: string }) => {
      // Fetch template items
      const { data: items, error: fetchErr } = await supabase
        .from('ia_checklist_template_items' as any)
        .select('*')
        .eq('template_id', templateId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (fetchErr) throw fetchErr;
      if (!items?.length) throw new Error('Template has no items');

      // Get current max sort_order
      const { data: existing } = await supabase
        .from('ia_audit_checklists' as any)
        .select('sort_order')
        .eq('audit_id', auditId)
        .eq('is_active', true)
        .order('sort_order', { ascending: false })
        .limit(1);

      const startOrder = ((existing as any)?.[0]?.sort_order ?? -1) + 1;

      // Insert all template items as checklist records
      const records = (items as any[]).map((item: any, idx: number) => ({
        audit_id: auditId,
        template_id: templateId,
        category: item.category || null,
        question: item.question,
        description: item.description || null,
        evidence_required: item.evidence_required || false,
        response: 'Not Assessed',
        status: 'Pending',
        sort_order: startOrder + idx,
        is_active: true,
      }));

      const { error: insertErr } = await supabase
        .from('ia_audit_checklists' as any)
        .insert(records);

      if (insertErr) throw insertErr;
      return records.length;
    },
    onSuccess: (count, { auditId }) => {
      queryClient.invalidateQueries({ queryKey: ['ia_audit_checklists', auditId] });
      toast({ title: 'Template Loaded', description: `${count} checklist item(s) added from template.` });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}
