import { createClient } from "npm:@supabase/supabase-js@2";

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

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Supabase service configuration is missing");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("Supabase public configuration is missing");

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

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  try {
    const session = await requireAdmin(request);
    if (!session) return json(request, { error: "只有管理员可以管理成员" }, 403);

    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    const status = body.status === "active" || body.status === "disabled" ? body.status : null;
    if (!userId || !status) return json(request, { error: "成员或状态无效" }, 400);
    if (userId === session.user.id) return json(request, { error: "不能停用自己的管理员账号" }, 400);

    const { data: target } = await session.admin
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (!target) return json(request, { error: "未找到成员" }, 404);
    if (target.role === "admin") return json(request, { error: "不能在这里停用管理员" }, 400);

    const { error } = await session.admin
      .from("memberships")
      .update({ status })
      .eq("user_id", userId);
    if (error) return json(request, { error: error.message }, 400);

    return json(request, { userId, status });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "更新失败" }, 500);
  }
});
