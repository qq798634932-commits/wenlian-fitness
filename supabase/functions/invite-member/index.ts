import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/admin.ts";

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
    if (!session) return json(request, { error: "只有管理员可以邀请成员" }, 403);

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!/^\S+@\S+\.\S+$/.test(email)) return json(request, { error: "请输入有效邮箱" }, 400);
    if (!displayName || displayName.length > 40) return json(request, { error: "称呼需要为 1-40 个字符" }, 400);

    const { data: existing } = await session.admin
      .from("memberships")
      .select("user_id, status")
      .eq("email", email)
      .maybeSingle();
    if (existing) return json(request, { error: "该邮箱已经是成员" }, 409);

    const { data: invitation, error: invitationError } = await session.admin
      .from("invitations")
      .insert({ email, display_name: displayName, invited_by: session.user.id })
      .select("id")
      .single();
    if (invitationError) return json(request, { error: "该邮箱已有待处理邀请" }, 409);

    const redirectTo = Deno.env.get("PUBLIC_SITE_URL") ?? undefined;
    const { error: inviteError } = await session.admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { display_name: displayName, invited_by: session.user.id },
    });

    if (inviteError) {
      await session.admin.from("invitations").delete().eq("id", invitation.id);
      return json(request, { error: inviteError.message }, 400);
    }

    return json(request, { invitationId: invitation.id, email });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "邀请失败" }, 500);
  }
});
