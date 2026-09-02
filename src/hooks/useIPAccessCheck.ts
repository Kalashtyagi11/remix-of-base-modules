/**
 * Hook to check if the current user's IP is whitelisted.
 * Uses sessionStorage cache to avoid re-checking on every navigation.
 * Renders children immediately (non-blocking) and only redirects on denial.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getClientIP } from '@/services/securityPolicyService';

const IP_CACHE_KEY = 'ip_access_check_result';
const IP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// One-time cleanup on module load: drop any previously cached denial so a
// stale/transient deny doesn't keep blocking every screen.
try {
  const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(IP_CACHE_KEY) : null;
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.allowed === false) sessionStorage.removeItem(IP_CACHE_KEY);
  }
} catch { /* noop */ }

interface CachedResult {
  ip: string;
  allowed: boolean;
  timestamp: number;
}

function getCachedResult(): CachedResult | null {
  try {
    const raw = sessionStorage.getItem(IP_CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedResult = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > IP_CACHE_TTL) {
      sessionStorage.removeItem(IP_CACHE_KEY);
      return null;
    }
    // Never trust a cached denial — always re-check so a transient deny
    // doesn't lock the user out across every screen.
    if (!parsed.allowed) {
      sessionStorage.removeItem(IP_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setCachedResult(ip: string, allowed: boolean) {
  // Only cache successful allow results — never persist a denial so a
  // transient/edge-function failure can't lock the user out across screens.
  if (!allowed) {
    try { sessionStorage.removeItem(IP_CACHE_KEY); } catch { /* noop */ }
    return;
  }
  try {
    sessionStorage.setItem(IP_CACHE_KEY, JSON.stringify({
      ip,
      allowed,
      timestamp: Date.now(),
    }));
  } catch {
    // sessionStorage unavailable
  }
}

interface IPCheckResult {
  isChecking: boolean;
  isAllowed: boolean | null;
  clientIP: string | null;
  recheckIP: () => void;
}

export function useIPAccessCheck(): IPCheckResult {
  // Check cache first — if cached as allowed, skip the loading spinner entirely
  const cached = getCachedResult();
  const [isChecking, setIsChecking] = useState(cached?.allowed !== true);
  const [isAllowed, setIsAllowed] = useState<boolean | null>(cached?.allowed ?? null);
  const [clientIP, setClientIP] = useState<string | null>(cached?.ip ?? null);

  const checkWhitelistDirectly = useCallback(async (ip: string) => {
    const { data, error } = await (supabase.rpc as any)('check_ip_whitelist', {
      p_ip_address: ip,
    });

    if (error) {
      console.error('[IPAccessCheck] Direct whitelist RPC error:', error);
      return null;
    }

    return data?.allowed ?? null;
  }, []);

  const checkAccess = useCallback(async () => {
    // If we have a valid cache hit, skip network calls
    const cachedNow = getCachedResult();
    if (cachedNow) {
      setClientIP(cachedNow.ip);
      setIsAllowed(cachedNow.allowed);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);

    // Race the entire IP check flow against a 2s timeout — fail-open on timeout
    const IP_CHECK_TIMEOUT_MS = 2000;

    try {
      const result = await Promise.race([
        (async () => {
          const ip = await getClientIP();

          // If the client IP cannot be resolved (ad-blocker, offline, blocked
          // lookup service) we cannot evaluate the whitelist at all — fail open
          // rather than locking the user out of every screen.
          if (!ip || ip === 'unknown') {
            console.warn('[IPAccessCheck] Client IP could not be resolved — failing open');
            return { ip: 'unknown', allowed: true };
          }

          const { data, error } = await supabase.functions.invoke('check-ip-access', {
            body: { ip_address: ip },
          });

          if (error) {
            console.error('[IPAccessCheck] Edge function error:', error);
            const directResult = await checkWhitelistDirectly(ip);
            return { ip, allowed: directResult ?? true };
          }

          if (data?.allowed === false && ip && ip !== 'unknown') {
            const directResult = await checkWhitelistDirectly(ip);
            if (directResult === true) {
              console.warn('[IPAccessCheck] Edge function denied a whitelisted IP, using direct RPC fallback.');
              return { ip, allowed: true };
            }
          }

          return { ip, allowed: (data?.allowed ?? true) as boolean };
        })(),
        new Promise<{ ip: string; allowed: boolean }>((resolve) =>
          setTimeout(() => {
            console.warn('[IPAccessCheck] Timed out after 2s — failing open');
            resolve({ ip: 'timeout', allowed: true });
          }, IP_CHECK_TIMEOUT_MS)
        ),
      ]);

      setClientIP(result.ip);
      setIsAllowed(result.allowed);
      setCachedResult(result.ip, result.allowed);
    } catch (err) {
      console.error('[IPAccessCheck] Unexpected error:', err);
      setIsAllowed(true);
    } finally {
      setIsChecking(false);
    }
  }, [checkWhitelistDirectly]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  return { isChecking, isAllowed, clientIP, recheckIP: checkAccess };
}
