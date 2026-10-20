create or replace function public.create_organization(org_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'You must be signed in to create an organization';
  end if;

  if org_name is null or btrim(org_name) = '' then
    raise exception 'Organization name is required';
  end if;

  insert into public.organizations (name)
  values (btrim(org_name))
  returning id into new_org_id;

  insert into public.memberships (organization_id, user_id, role)
  values (new_org_id, current_user_id, 'owner');

  return new_org_id;
end;
$$;

revoke all on function public.create_organization(text) from public;
revoke all on function public.create_organization(text) from anon;
grant execute on function public.create_organization(text) to authenticated;