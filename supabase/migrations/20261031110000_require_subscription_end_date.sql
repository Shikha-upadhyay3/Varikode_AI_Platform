-- Active now requires a real, future end date.
-- A NULL end date no longer means "never expires".
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
      and o.subscription_ends_at is not null
      and o.subscription_ends_at > now()
  );
$$;

-- Helper for the payment webhook: grants one month of access.
-- If the plan is still running, the new month is added after the current
-- end date, so a client who renews early does not lose remaining days.
create or replace function public.activate_subscription_one_month(org_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  new_end timestamptz;
begin
  update public.organizations
  set subscription_status = 'active',
      subscription_ends_at =
        greatest(coalesce(subscription_ends_at, now()), now()) + interval '1 month'
  where id = org_id
  returning subscription_ends_at into new_end;

  return new_end;
end;
$$;

-- Only the backend (service role) may call it, never the browser.
revoke all on function public.activate_subscription_one_month(uuid) from public, anon, authenticated;
grant execute on function public.activate_subscription_one_month(uuid) to service_role;