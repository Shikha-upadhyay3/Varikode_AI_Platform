create or replace function private.can_manage_org(check_org_id uuid)
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
      and role in ('owner', 'admin')
  );
$$;

revoke all on function private.can_manage_org(uuid) from public;
grant execute on function private.can_manage_org(uuid) to authenticated;

create table if not exists public.chatbots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 1 and 80),
  description text
    check (description is null or char_length(description) <= 280),
  welcome_message text
    check (welcome_message is null or char_length(welcome_message) <= 360),
  theme text not null default 'ocean'
    check (theme in ('ocean', 'slate', 'mint', 'violet')),
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  created_by uuid
    references auth.users(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chatbots_organization_name_key
on public.chatbots (organization_id, lower(btrim(name)));

create index if not exists chatbots_organization_status_idx
on public.chatbots (organization_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_chatbots_updated_at on public.chatbots;
create trigger set_chatbots_updated_at
before update on public.chatbots
for each row
execute function public.set_updated_at();

alter table public.chatbots enable row level security;

grant select, insert, update, delete on public.chatbots to authenticated;

create policy "Organization members can view chatbots"
on public.chatbots
for select
to authenticated
using ((select private.is_org_member(organization_id)));

create policy "Organization admins can create chatbots"
on public.chatbots
for insert
to authenticated
with check (
  (select private.can_manage_org(organization_id))
  and created_by = (select auth.uid())
);

create policy "Organization admins can update chatbots"
on public.chatbots
for update
to authenticated
using ((select private.can_manage_org(organization_id)))
with check ((select private.can_manage_org(organization_id)));

create policy "Organization admins can delete chatbots"
on public.chatbots
for delete
to authenticated
using ((select private.can_manage_org(organization_id)));
