import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get client IP from request - trust the connection IP
    // In edge functions, the actual client IP can come from headers set by the infrastructure
    const forwarded = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    // Only trust first IP from x-forwarded-for (set by the load balancer)
    const clientIp = forwarded?.split(",")[0]?.trim() || realIp || "unknown";

    // Also accept IP from body for client-side check (fallback)
    let bodyIp: string | undefined;
    try {
      const body = await req.json();
      bodyIp = body?.ip_address;
    } catch {
      // No body is fine
    }

    const ipToCheck = bodyIp || clientIp;

    if (!ipToCheck || ipToCheck === "unknown") {
      return new Response(
        // Fail-open: if neither the client nor the infrastructure could resolve an
        // IP (ad-blocker / offline / blocked lookup service), we must not lock the
        // user out — every other failure path in this function also fails open.
        JSON.stringify({ allowed: true, reason: "unable_to_determine_ip", ip: ipToCheck }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call the database function to check whitelist
    const { data, error } = await supabase.rpc("check_ip_whitelist", {
      p_ip_address: ipToCheck,
    });

    if (error) {
      console.error("check_ip_whitelist error:", error);
      // On error, allow access (fail-open to not lock everyone out)
      return new Response(
        JSON.stringify({ allowed: true, reason: "check_error", ip: ipToCheck }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ...data, ip: ipToCheck }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ allowed: true, reason: "server_error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
