import { executeBatchAction, fetchBatchItems } from '@/services/bn/batchOperationsService';
import { prepareIssueFromBatch, executeIssue } from '@/services/bn/paymentIssueService';
import { supabase } from '@/integrations/supabase/client';
const db = supabase as any;
await (supabase as any).auth.setSession(JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON!));

const target = 'BN-20260902-36729';
let { data: claim } = await db.from('bn_claim').select('id, claim_number').eq('claim_number', target).maybeSingle();
if (!claim) {
  const { data: any1 } = await db.from('bn_payment_instruction').select('claim_id').eq('status','READY').not('claim_id','is',null).limit(1);
  const { data: c2 } = await db.from('bn_claim').select('id, claim_number').eq('id', any1[0].claim_id).maybeSingle();
  claim = c2;
}
console.log('claim', claim);
const { data: pays } = await db.from('bn_payment_instruction').select('id, amount, status, payment_method, claim_id').eq('claim_id', claim.id).eq('status','READY');
console.log('payables', pays);
const payId = pays[0].id;
const batch = await executeBatchAction({ action: 'CREATE', userCode: 'MAKER1', paymentMethod: 'MIXED', officeCode: 'HQ', notes: 'pipeline verification' });
console.log('batch', batch.id, batch.batch_number);
await executeBatchAction({ action: 'ADD_PAYABLES', batchId: batch.id, payableIds: [payId], userCode: 'MAKER1' });
console.log('items', await fetchBatchItems(batch.id));
console.log('validate', await executeBatchAction({ action: 'VALIDATE', batchId: batch.id, userCode: 'MAKER1' }));
await executeBatchAction({ action: 'APPROVE', batchId: batch.id, userCode: 'CHECKER1', narrative: 'approved' });
await executeBatchAction({ action: 'RELEASE', batchId: batch.id, userCode: 'CHECKER1', narrative: 'released' });
console.log('prepared', await prepareIssueFromBatch(batch.id, 'CHECKER1'));
const { data: issues } = await db.from('bn_issue_record').select('*').eq('batch_id', batch.id);
console.log('issues', issues.map((i:any)=>({id:i.id,target:i.target_table,method:i.issue_method,status:i.status,claim:i.claim_number})));
console.log('exec', JSON.stringify(await executeIssue(issues.map((i:any)=>i.id), 'CHECKER1'), null, 1));
const { data: after } = await db.from('bn_issue_record').select('status, cheque_number, dd_reference, error_message').eq('batch_id', batch.id);
console.log('after', after);
const { data: pi } = await db.from('bn_payment_instruction').select('status, payment_reference').eq('id', payId);
console.log('payable after', pi);
console.log('BATCH_ID', batch.id);
