/**
 * Centralized Security Policy Service
 * Handles unauthorized access logging, IP blocking checks, lockdown state, and rate limiting.
 * All security decisions go through Supabase — no client-side-only security.
 */

import { supabase } from '@/integrations/supabase/client';

export interface SecurityState {
  is_locked: boolean;
  locked_at: string | null;
  locked_reason: string | null;
}

export interface SecurityConfig {
  ip_rate_limit_max_attempts: number;
  ip_rate_limit_window_minutes: number;
  ip_block_duration_minutes: number;
  global_attack_threshold: number;
  global_attack_window_minutes: number;
  lockdown_enabled: boolean;
  pii_mask_enabled: boolean;
  pii_unlock_duration_minutes: number;
}

const DEFAULT_CONFIG: SecurityConfig = {
  ip_rate_limit_max_attempts: 10,
  ip_rate_limit_window_minutes: 15,
  ip_block_duration_minutes: 60,
  global_attack_threshold: 50,
  global_attack_window_minutes: 10,
  lockdown_enabled: true,
  pii_mask_enabled: true,
  pii_unlock_duration_minutes: 15,
};

let cachedConfig: SecurityConfig | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60_000; // 1 minute

/**
 * Fetch security policy configuration from Supabase
 */
export async function getSecurityConfig(): Promise<SecurityConfig> {
  if (cachedConfig && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
    return cachedConfig;
  }

  try {
    const { data, error } = await supabase
      .from('security_policy_config')
      .select('config_key, config_value');

    if (error) {
      console.error('[SecurityPolicy] Failed to load config:', error);
      return DEFAULT_CONFIG;
    }

    const config = { ...DEFAULT_CONFIG };
    (data || []).forEach((row: { config_key: string; config_value: string }) => {
      const key = row.config_key as keyof SecurityConfig;
      if (key in config) {
        const val = row.config_value;
        if (typeof DEFAULT_CONFIG[key] === 'boolean') {
          (config as any)[key] = val === 'true';
        } else if (typeof DEFAULT_CONFIG[key] === 'number') {
          (config as any)[key] = parseInt(val, 10) || DEFAULT_CONFIG[key];
        } else {
          (config as any)[key] = val;
        }
      }
    });

    cachedConfig = config;
    configCacheTime = Date.now();
    return config;
  } catch (err) {
    console.error('[SecurityPolicy] Unexpected error:', err);
    return DEFAULT_CONFIG;
  }
}

/**
 * Invalidate config cache (call after admin updates config)
 */
export function invalidateSecurityConfigCache() {
  cachedConfig = null;
  configCacheTime = 0;
}

/**
 * Get the current application lockdown state
 */
export async function getAppLockdownState(): Promise<SecurityState> {
  try {
    const { data, error } = await supabase
      .from('app_lockdown_state')
      .select('is_locked, locked_at, locked_reason')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('[SecurityPolicy] Failed to check lockdown:', error);
      return { is_locked: false, locked_at: null, locked_reason: null };
    }

    return {
      is_locked: data?.is_locked ?? false,
      locked_at: data?.locked_at ?? null,
      locked_reason: data?.locked_reason ?? null,
    };
  } catch {
    return { is_locked: false, locked_at: null, locked_reason: null };
  }
}

/**
 * Check if an IP is currently blocked
 */
export async function isIPBlocked(ipAddress: string): Promise<boolean> {
  if (!ipAddress) return false;

  try {
    const { data, error } = await supabase
      .from('security_ip_blocks')
      .select('id')
      .eq('ip_address', ipAddress)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .limit(1);

    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Log an unauthorized access attempt and check rate limits via Supabase RPC
 */
export async function logUnauthorizedAccess(params: {
  route: string;
  moduleName?: string;
  userId?: string;
  userEmail?: string;
  reason: string;
  severity?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ blocked: boolean; lockdown?: boolean }> {
  try {
    const { data, error } = await (supabase.rpc as any)('check_and_log_unauthorized_access', {
      _ip_address: params.ipAddress || 'unknown',
      _route: params.route,
      _module_name: params.moduleName || null,
      _user_id: params.userId || null,
      _user_email: params.userEmail || null,
      _reason: params.reason,
      _severity: params.severity || 'medium',
      _user_agent: params.userAgent || navigator.userAgent,
    });

    if (error) {
      console.error('[SecurityPolicy] Failed to log unauthorized access:', error);
      // Still insert the log directly as fallback
      await supabase.from('unauthorized_access_logs').insert({
        ip_address: params.ipAddress || 'unknown',
        route_attempted: params.route,
        module_name: params.moduleName,
        user_id: params.userId,
        user_email: params.userEmail,
        reason: params.reason,
        severity: params.severity || 'medium',
        user_agent: params.userAgent || navigator.userAgent,
      });
      return { blocked: false };
    }

    return {
      blocked: data?.blocked ?? false,
      lockdown: data?.lockdown ?? false,
    };
  } catch {
    return { blocked: false };
  }
}

/**
 * Admin: Lift application lockdown
 */
export async function liftLockdown(userId: string, reason: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('app_lockdown_state')
      .update({
        is_locked: false,
        unlocked_at: new Date().toISOString(),
        unlocked_by: userId,
        unlock_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('is_locked', true);

    if (error) {
      console.error('[SecurityPolicy] Failed to lift lockdown:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Admin: Unblock an IP
 */
export async function unblockIP(ipAddress: string, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('security_ip_blocks')
      .update({
        is_active: false,
        unblocked_at: new Date().toISOString(),
        unblocked_by: userId,
      })
      .eq('ip_address', ipAddress)
      .eq('is_active', true);

    if (error) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Get client IP address (best effort from client side)
 */
let cachedIP: string | null = null;
let ipFetchPromise: Promise<string> | null = null;

export async function getClientIP(): Promise<string> {
  if (cachedIP) return cachedIP;
  // Share a single in-flight request across concurrent callers
  if (ipFetchPromise) return ipFetchPromise;

  ipFetchPromise = (async () => {
    try {
      // Try multiple providers — a single blocked/unreachable endpoint must not
      // make the IP undeterminable (which downstream treats as a security event).
      const providers: Array<{ url: string; pick: (d: any) => string | undefined }> = [
        { url: 'https://api.ipify.org?format=json', pick: (d) => d?.ip },
        { url: 'https://ipapi.co/json/', pick: (d) => d?.ip },
        { url: 'https://api.bigdatacloud.net/data/client-ip', pick: (d) => d?.ipString },
      ];

      for (const provider of providers) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(provider.url, { signal: controller.signal });
          clearTimeout(timeout);
          if (!res.ok) continue;
          const data = await res.json();
          const ip = provider.pick(data);
          if (ip) {
            cachedIP = ip;
            return cachedIP;
          }
        } catch {
          // try the next provider
        }
      }

      cachedIP = 'unknown';
      return 'unknown';
    } catch {
      cachedIP = 'unknown';
      return 'unknown';
    } finally {
      ipFetchPromise = null;
    }
  })();

  return ipFetchPromise;
}
