import { supabase } from '@/integrations/supabase/client';
const r = await (supabase as any).from('bn_payment_instruction').select('id,status').limit(3);
console.log(JSON.stringify(r).slice(0,500));
console.log(import.meta.env?.VITE_SUPABASE_URL);
