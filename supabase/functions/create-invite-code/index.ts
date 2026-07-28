import { createClient } from "npm:@supabase/supabase-js@2";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function corsHeaders(request: Request) {
  const configuredSiteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "";
  let configuredOrigin = configuredSiteUrl.replace(/\/+$/, "");
  try {
    configuredOrigin = new URL(configuredSiteUrl).origin;
  } catch {
    // Keep the trimmed value so a malformed secret fails closed.
  }
  const requestOrigin = request.headers.get("origin") ?? "";
  const allowedOrigin = requestOrigin && requestOrigin === configuredOrigin
    ? requestOrigin
    : configuredOrigin;

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Supabase service configuration is missing");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !url || !anonKey) return null;

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return null;

  const admin = serviceClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("user_id, role, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "admin" || membership.status !== "active") return null;
  return { user, admin };
}

function generateCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  return `WL-${value.slice(0, 4)}-${value.slice(4)}`;
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function hashCode(code: string) {
  const bytes = new TextEncoder().encode(normalizeCode(code));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  try {
    const session = await requireAdmin(request);
    if (!session) return json(request, { error: "只有管理员可以生成邀请码" }, 403);

    const body = await request.json();
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName || displayName.length > 40) {
      return json(request, { error: "称呼需要为 1-40 个字符" }, 400);
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const code = generateCode();
      const codeHash = await hashCode(code);
      const { data, error } = await session.admin
        .from("invite_codes")
        .insert({
          code_hash: codeHash,
          code_hint: code.slice(-4),
          display_name: displayName,
          created_by: session.user.id,
          expires_at: expiresAt,
        })
        .select("id, expires_at")
        .single();

      if (!error && data) {
        return json(request, {
          invitationId: data.id,
          code,
          displayName,
          expiresAt: data.expires_at,
        });
      }
    }

    return json(request, { error: "邀请码生成失败，请重试" }, 500);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "邀请码生成失败" }, 500);
  }
});
