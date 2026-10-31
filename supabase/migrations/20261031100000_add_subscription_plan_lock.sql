-- =====================================================================
-- Plan lock: the chatbot only works on a website while the
-- organization's subscription is active.
-- =====================================================================

-- 1. Add subscription columns to organizations.
--    New organizations start as 'inactive', so the chatbot stays off
--    until a payment is confirmed.
alter table public.organizations
  add column if not exists subscription_status text not null default 'inactive',
  add column if not exists subscription_ends_at timestamptz;

-- 2. Helper used by the public-chat Edge Function.
--    Returns true only if the status is 'active' and the plan has not expired.
create or replace function public.has_active_subscription(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = org_id
      and o.subscription_status = 'active'
      and (o.subscription_ends_at is null or o.subscription_ends_at > now())
  );
$$;

-- 3. Only the backend (service role) may call the function, never the browser.
revoke all on function public.has_active_subscription(uuid) from public, anon, authenticated;
grant execute on function public.has_active_subscription(uuid) to service_role;

-- 4. Prevent clients from changing subscription fields from the browser.
--    Requests from 'anon' or 'authenticated' users are blocked; the service
--    role (payment webhook) and the SQL Editor are still allowed.
create or replace function public.protect_subscription_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.subscription_status is distinct from old.subscription_status
          or new.subscription_ends_at is distinct from old.subscription_ends_at) then
    raise exception 'subscription fields can only be changed by the system';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_subscription_columns on public.organizations;
create trigger protect_subscription_columns
  before update on public.organizations
  for each row execute function public.protect_subscription_columns();