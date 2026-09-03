import { routeClaimToWorkbasket } from './src/services/bn/workflow/routeClaimToWorkbasket';
const r = await routeClaimToWorkbasket('4b24cb11-2785-43c0-bef7-2d2f336f73f9', 'DIAGNOSTIC');
console.log(JSON.stringify(r, null, 2));
