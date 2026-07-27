import { createClient } from "npm:@supabase/supabase-js@2";

export function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Supabase service configuration is missing");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export async function requireAdmin(request: Request) {
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
