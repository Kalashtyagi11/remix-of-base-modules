/**
 * Benefits Actor Service
 *
 * Single, server-verified answer to "is the signed-in user an administrator?"
 * and the one role gate every Benefits action uses.
 *
 * Administrators have full privilege across Benefits: every action is
 * permitted, including approving or releasing work they created themselves.
 * Each bypass is recorded by the calling service in its audit entry with
 * override_reason = 'ADMIN_FULL_PRIVILEGE'.
 */
import { supabase } from '@/integrations/supabase/client';

export const ADMIN_OVERRIDE_REASON = 'ADMIN_FULL_PRIVILEGE';

let cache: { userId: string; isAdmin: boolean } | null = null;

async function currentUserId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (auth?.user?.id) return auth.user.id;
  const { data: session } = await supabase.auth.getSession();
  return session?.session?.user?.id ?? null;
}

/** Server-verified administrator check (backed by the is_admin RPC). */
export async function isBenefitsAdmin(): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;
  if (cache && cache.userId === userId) return cache.isAdmin;
  try {
    const { data } = await (supabase.rpc as any)('is_admin', { _user_id: userId });
    cache = { userId, isAdmin: !!data };
    return cache.isAdmin;
  } catch {
    return false;
  }
}

export function resetBenefitsAdminCache(): void {
  cache = null;
}

/** Case-insensitive role match so `Admin` satisfies a gate written for `ADMIN`. */
export function rolesMatch(allowedRoles: string[], userRoles: string[]): boolean {
  const held = new Set((userRoles || []).map(r => String(r).trim().toUpperCase()));
  return (allowedRoles || []).some(r => held.has(String(r).trim().toUpperCase()));
}

export function holdsAdminRole(userRoles: string[]): boolean {
  return rolesMatch(['ADMIN', 'ADMINISTRATOR', 'PLATFORM_ADMIN', 'SUPER_ADMIN'], userRoles);
}

/**
 * Synchronous gate for UI lists where the caller already knows the user's roles.
 * Administrators always pass.
 */
export function canPerform(allowedRoles: string[], userRoles: string[]): boolean {
  return holdsAdminRole(userRoles) || rolesMatch(allowedRoles, userRoles);
}

/**
 * Async gate for service entry points: the administrator answer comes from the
 * server, so a locally stale role list cannot block an administrator.
 */
export async function canPerformAsync(allowedRoles: string[], userRoles: string[]): Promise<boolean> {
  if (canPerform(allowedRoles, userRoles)) return true;
  return isBenefitsAdmin();
}
