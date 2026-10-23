-- Visitor details (name, email, phone) + chatbot logo

-- 1. Chatbot settings: logo and "ask visitors for details" switch
alter table public.chatbots
  add column if not exists logo_url text,
  add column if not exists collect_leads boolean not null default true;

-- 2. Visitor leads (written by the public-chat Edge Function with the service role)
create table if not exists public.visitor_leads (
  id uuid primary key default gen_random_uuid(),
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  visitor_id text not null,
  name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitor_leads_not_empty
    check (name is not null or email is not null or phone is not null),
  constraint visitor_leads_lengths
    check (
      char_length(coalesce(name, '')) <= 80
      and char_length(coalesce(email, '')) <= 254
      and char_length(coalesce(phone, '')) <= 20
    ),
  constraint visitor_leads_one_per_visitor unique (chatbot_id, visitor_id)
);

create index if not exists visitor_leads_chatbot_created_idx
  on public.visitor_leads (chatbot_id, created_at desc);

drop trigger if exists set_visitor_leads_updated_at on public.visitor_leads;
create trigger set_visitor_leads_updated_at
before update on public.visitor_leads
for each row
execute function public.set_updated_at();

alter table public.visitor_leads enable row level security;

-- Dashboard users can read and delete leads; nobody can insert/update from the browser.
grant select, delete on public.visitor_leads to authenticated;

create policy "Members can view visitor leads"
on public.visitor_leads
for select
to authenticated
using (
  exists (
    select 1 from public.chatbots c
    where c.id = visitor_leads.chatbot_id
  )
);

create policy "Owners and admins can delete visitor leads"
on public.visitor_leads
for delete
to authenticated
using (
  exists (
    select 1 from public.chatbots c
    where c.id = visitor_leads.chatbot_id
      and private.can_manage_org(c.organization_id)
  )
);

-- 3. Public bucket for chatbot logos (the widget loads them on other websites)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chatbot-logos',
  'chatbot-logos',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- File path: <chatbot_id>/<filename>
create policy "Members can list chatbot logos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chatbot-logos'
  and exists (
    select 1 from public.chatbots c
    where c.id::text = (storage.foldername(name))[1]
  )
);

create policy "Owners and admins can upload chatbot logos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chatbot-logos'
  and exists (
    select 1 from public.chatbots c
    where c.id::text = (storage.foldername(name))[1]
      and private.can_manage_org(c.organization_id)
  )
);

create policy "Owners and admins can delete chatbot logos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chatbot-logos'
  and exists (
    select 1 from public.chatbots c
    where c.id::text = (storage.foldername(name))[1]
      and private.can_manage_org(c.organization_id)
  )
);

notify pgrst, 'reload schema';