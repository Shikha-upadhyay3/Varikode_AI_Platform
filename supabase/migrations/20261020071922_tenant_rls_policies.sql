create schema if not exists private;

create or replace function private.is_org_member(check_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where organization_id = check_org_id
      and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;

grant select on public.organizations to authenticated;
grant select on public.memberships to authenticated;

create policy "Members can view their organizations"
on public.organizations
for select
to authenticated
using ((select private.is_org_member(id)));

create policy "Members can view organization memberships"
on public.memberships
for select
to authenticated
using ((select private.is_org_member(organization_id)));