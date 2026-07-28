import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MemberRole = "admin" | "member";
export type MemberStatus = "active" | "disabled";
export type MemberAuthMethod = "email" | "invite_code";

export type Membership = {
  user_id: string;
  email: string;
  login_id: string | null;
  auth_method: MemberAuthMethod;
  display_name: string;
  role: MemberRole;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
};

export type CloudSession = {
  client: SupabaseClient;
  userId: string;
  email: string;
  membership: Membership;
};

export function normalizeMemberLoginId(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatMemberLoginId(value: string) {
  const normalized = normalizeMemberLoginId(value);
  if (normalized.length !== 10) return value.trim().toUpperCase();
  return `${normalized.slice(0, 2)}-${normalized.slice(2, 6)}-${normalized.slice(6)}`;
}

export function memberAuthEmail(loginId: string) {
  return `${normalizeMemberLoginId(loginId).toLowerCase()}@members.wenlian-fitness.app`;
}

export function memberAuthPassword(loginId: string, pin: string) {
  return `Wl!${pin}-${normalizeMemberLoginId(loginId)}-9x`;
}

declare global {
  interface Window {
    __WENLIAN_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    };
  }
}

let singleton: SupabaseClient | null | undefined;

export function getSupabaseClient() {
  if (singleton !== undefined) return singleton;
  if (typeof window === "undefined") return null;

  const url = window.__WENLIAN_CONFIG__?.supabaseUrl?.trim();
  const anonKey = window.__WENLIAN_CONFIG__?.supabaseAnonKey?.trim();
  if (!url || !anonKey) {
    singleton = null;
    return singleton;
  }

  singleton = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // This is a client-only static app. Implicit auth lets a magic link opened
      // from iOS Mail/Gmail establish the session in Safari even when the link
      // was requested from a different browser context.
      flowType: "implicit",
    },
  });
  return singleton;
}
