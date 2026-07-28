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

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatLoginId(normalized: string) {
  return `${normalized.slice(0, 2)}-${normalized.slice(2, 6)}-${normalized.slice(6)}`;
}

function memberEmail(normalized: string) {
  return `${normalized.toLowerCase()}@members.wenlian-fitness.app`;
}

function memberPassword(normalized: string, pin: string) {
  return `Wl!${pin}-${normalized}-9x`;
}

async function hashCode(code: string) {
  const bytes = new TextEncoder().encode(normalizeCode(code));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function weakPin(pin: string) {
  return /^([0-9])\1{5}$/.test(pin) || pin === "123456" || pin === "654321";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) {
    return json(request, { error: "Supabase service configuration is missing" }, 500);
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  let claimedInvitationId = "";
  let createdUserId = "";
  let redemptionComplete = false;

  try {
    const body = await request.json();
    const code = typeof body.code === "string" ? body.code : "";
    const pin = typeof body.pin === "string" ? body.pin : "";
    const normalized = normalizeCode(code);

    if (!/^WL[A-HJ-NP-Z2-9]{8}$/.test(normalized)) {
      return json(request, { error: "请输入有效的邀请码" }, 400);
    }
    if (!/^\d{6}$/.test(pin)) {
      return json(request, { error: "请输入6位数字密码" }, 400);
    }
    if (weakPin(pin)) {
      return json(request, { error: "请不要使用连续数字或6位相同数字" }, 400);
    }

    const codeHash = await hashCode(normalized);
    const { data: invitation } = await admin
      .from("invite_codes")
      .select("id, display_name, status, created_by, expires_at")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (!invitation) return json(request, { error: "邀请码不存在或输入有误" }, 404);
    if (invitation.status === "redeemed") return json(request, { error: "这个邀请码已经使用过" }, 409);
    if (invitation.status !== "pending") return json(request, { error: "这个邀请码当前不可用" }, 409);
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await admin.from("invite_codes").update({ status: "expired" }).eq("id", invitation.id).eq("status", "pending");
      return json(request, { error: "这个邀请码已经过期" }, 410);
    }

    const { data: claimed } = await admin
      .from("invite_codes")
      .update({ status: "claiming", claimed_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) return json(request, { error: "邀请码正在被使用，请稍后重试" }, 409);
    claimedInvitationId = claimed.id;

    const loginId = formatLoginId(normalized);
    const email = memberEmail(normalized);
    const password = memberPassword(normalized, pin);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: invitation.display_name,
        login_id: loginId,
        auth_method: "invite_code",
      },
    });
    if (createError || !created.user) throw new Error(createError?.message ?? "账号创建失败");
    createdUserId = created.user.id;

    const { error: membershipError } = await admin
      .from("memberships")
      .update({
        display_name: invitation.display_name,
        role: "member",
        status: "active",
        invited_by: invitation.created_by,
        login_id: loginId,
        auth_method: "invite_code",
      })
      .eq("user_id", created.user.id);
    if (membershipError) throw membershipError;

    const { error: redeemError } = await admin
      .from("invite_codes")
      .update({
        status: "redeemed",
        redeemed_by: created.user.id,
        redeemed_at: new Date().toISOString(),
      })
      .eq("id", invitation.id)
      .eq("status", "claiming");
    if (redeemError) throw redeemError;
    redemptionComplete = true;

    const publicClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: signedIn, error: signInError } = await publicClient.auth.signInWithPassword({ email, password });
    if (signInError || !signedIn.session) throw new Error(signInError?.message ?? "账号登录失败");

    return json(request, {
      loginId,
      displayName: invitation.display_name,
      accessToken: signedIn.session.access_token,
      refreshToken: signedIn.session.refresh_token,
    });
  } catch (error) {
    if (createdUserId && !redemptionComplete) {
      await admin.auth.admin.deleteUser(createdUserId);
    }
    if (claimedInvitationId) {
      await admin
        .from("invite_codes")
        .update({ status: "pending", claimed_at: null })
        .eq("id", claimedInvitationId)
        .eq("status", "claiming");
    }
    return json(request, { error: error instanceof Error ? error.message : "账号创建失败" }, 500);
  }
});
