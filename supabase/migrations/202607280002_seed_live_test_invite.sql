do $$
declare
  admin_user_id uuid;
begin
  select user_id
  into admin_user_id
  from public.memberships
  where role = 'admin' and status = 'active'
  order by created_at
  limit 1;

  if admin_user_id is null then
    raise exception 'An active administrator is required before creating the live test invitation';
  end if;

  insert into public.invite_codes (
    code_hash,
    code_hint,
    display_name,
    created_by,
    expires_at
  ) values (
    '88c9679f183b40ae37e6e07b202fa9a50fb71e74399519eb2c146acf14276007',
    '7K9M',
    '线上测试账号',
    admin_user_id,
    now() + interval '7 days'
  ) on conflict (code_hash) do nothing;
end $$;
