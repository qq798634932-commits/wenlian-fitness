create type public.member_auth_method as enum ('email', 'invite_code');
create type public.invite_code_status as enum ('pending', 'claiming', 'redeemed', 'cancelled', 'expired');

alter table public.memberships
  add column login_id text,
  add column auth_method public.member_auth_method not null default 'email';

create unique index memberships_login_id_unique
  on public.memberships (upper(login_id))
  where login_id is not null;

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  status public.invite_code_status not null default 'pending',
  created_by uuid not null references auth.users(id) on delete cascade,
  redeemed_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  redeemed_at timestamptz
);

create index invite_codes_status_created_idx
  on public.invite_codes (status, created_at desc);

alter table public.invite_codes enable row level security;

create policy invite_codes_read_admin on public.invite_codes
for select to authenticated
using (public.is_current_admin());

grant select on public.invite_codes to authenticated;

comment on table public.invite_codes is 'One-time family onboarding codes. Only a SHA-256 digest is stored; the six-digit member PIN is handled by Supabase Auth and is never stored here.';
comment on column public.memberships.login_id is 'Public member login identifier created from the redeemed invitation code.';
comment on column public.memberships.auth_method is 'Distinguishes the administrator email login from family invitation-code accounts.';
