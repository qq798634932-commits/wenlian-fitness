create extension if not exists pgcrypto;

create type public.member_role as enum ('admin', 'member');
create type public.member_status as enum ('active', 'disabled');
create type public.invitation_status as enum ('pending', 'accepted', 'cancelled', 'expired');

create table public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role public.member_role not null default 'member',
  status public.member_status not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index memberships_email_unique on public.memberships (lower(email));

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null default '',
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index invitations_one_pending_per_email
  on public.invitations (lower(email))
  where status = 'pending';

create table public.training_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  age integer not null check (age between 12 and 100),
  height_cm numeric(5,2) not null check (height_cm between 100 and 250),
  weight_kg numeric(6,2) not null check (weight_kg between 25 and 350),
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  goal text not null check (goal in ('general', 'muscle', 'strength', 'fat-loss')),
  weekly_days integer not null check (weekly_days in (3, 4)),
  updated_at timestamptz not null default now()
);

create table public.body_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  log_date date not null,
  weight_kg numeric(6,2) not null check (weight_kg between 25 and 350),
  sleep_hours numeric(4,2) not null check (sleep_hours between 0 and 24),
  energy integer not null check (energy between 1 and 5),
  soreness integer not null check (soreness between 0 and 2),
  pain text not null check (pain in ('none', 'mild', 'sharp')),
  target text not null check (target in ('chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'full')),
  duration_minutes integer not null check (duration_minutes in (30, 45, 60, 75)),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index body_logs_user_date_idx on public.body_logs (user_id, log_date desc);

create table public.training_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  target text not null,
  generated_at timestamptz not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index training_plans_user_generated_idx on public.training_plans (user_id, generated_at desc);

create table public.workout_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  workout_id text not null,
  title text not null,
  finished_at timestamptz not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index workout_records_user_finished_idx on public.workout_records (user_id, finished_at desc);

create table public.music_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('netease', 'qq')),
  title text not null,
  url text,
  external_id text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  check (
    (provider = 'netease' and external_id is not null)
    or (provider = 'qq' and url is not null)
  )
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger memberships_touch_updated_at
before update on public.memberships
for each row execute function public.touch_updated_at();

create trigger training_profiles_touch_updated_at
before update on public.training_profiles
for each row execute function public.touch_updated_at();

create trigger training_plans_touch_updated_at
before update on public.training_plans
for each row execute function public.touch_updated_at();

create trigger workout_records_touch_updated_at
before update on public.workout_records
for each row execute function public.touch_updated_at();

create trigger music_links_touch_updated_at
before update on public.music_links
for each row execute function public.touch_updated_at();

create or replace function public.is_active_member(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = target_user_id and status = 'active'
  );
$$;

create or replace function public.is_current_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

revoke all on function public.is_active_member(uuid) from public;
revoke all on function public.is_current_admin() from public;
grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.is_current_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_invitation public.invitations%rowtype;
begin
  select * into pending_invitation
  from public.invitations
  where lower(email) = lower(coalesce(new.email, ''))
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  insert into public.memberships (
    user_id,
    email,
    display_name,
    role,
    status,
    invited_by
  ) values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(nullif(pending_invitation.display_name, ''), nullif(new.raw_user_meta_data ->> 'display_name', ''), '亲友成员'),
    'member',
    case when pending_invitation.id is null then 'disabled'::public.member_status else 'active'::public.member_status end,
    pending_invitation.invited_by
  ) on conflict (user_id) do nothing;

  if pending_invitation.id is not null then
    update public.invitations
    set status = 'accepted', accepted_by = new.id, accepted_at = now()
    where id = pending_invitation.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.training_profiles enable row level security;
alter table public.body_logs enable row level security;
alter table public.training_plans enable row level security;
alter table public.workout_records enable row level security;
alter table public.music_links enable row level security;

create policy memberships_read_self_or_admin on public.memberships
for select to authenticated
using (user_id = auth.uid() or public.is_current_admin());

create policy memberships_update_own_name on public.memberships
for update to authenticated
using (user_id = auth.uid() and public.is_active_member())
with check (user_id = auth.uid() and public.is_active_member());

create policy invitations_read_admin on public.invitations
for select to authenticated
using (public.is_current_admin());

create policy training_profiles_own_rows on public.training_profiles
for all to authenticated
using (user_id = auth.uid() and public.is_active_member())
with check (user_id = auth.uid() and public.is_active_member());

create policy body_logs_own_rows on public.body_logs
for all to authenticated
using (user_id = auth.uid() and public.is_active_member())
with check (user_id = auth.uid() and public.is_active_member());

create policy training_plans_own_rows on public.training_plans
for all to authenticated
using (user_id = auth.uid() and public.is_active_member())
with check (user_id = auth.uid() and public.is_active_member());

create policy workout_records_own_rows on public.workout_records
for all to authenticated
using (user_id = auth.uid() and public.is_active_member())
with check (user_id = auth.uid() and public.is_active_member());

create policy music_links_own_rows on public.music_links
for all to authenticated
using (user_id = auth.uid() and public.is_active_member())
with check (user_id = auth.uid() and public.is_active_member());

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select on public.memberships, public.invitations to authenticated;
grant update (display_name) on public.memberships to authenticated;
grant select, insert, update, delete on public.training_profiles to authenticated;
grant select, insert, update, delete on public.body_logs to authenticated;
grant select, insert, update, delete on public.training_plans to authenticated;
grant select, insert, update, delete on public.workout_records to authenticated;
grant select, insert, update, delete on public.music_links to authenticated;

comment on table public.memberships is 'Non-sensitive membership metadata. Admins can manage access but cannot read private fitness tables.';
comment on table public.training_profiles is 'Private fitness profile. Row-level policies only permit the owning user.';
comment on table public.workout_records is 'Private workout history. Admin role has no read policy.';
