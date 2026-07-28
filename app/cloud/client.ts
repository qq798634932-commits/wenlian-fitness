import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MemberRole = "admin" | "member";
export type MemberStatus = "active" | "disabled";

export type Membership = {
  user_id: string;
  email: string;
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
