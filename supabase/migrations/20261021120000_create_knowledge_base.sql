-- Milestone 6: Knowledge base (sources, chunks, vector search, storage)

-- 1. pgvector extension (embeddings ke liye)
create extension if not exists vector with schema extensions;

-- 2. knowledge_sources: upload ki hui file ya website
create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  source_type text not null check (source_type in ('file', 'website')),
  title text not null,
  file_path text,
  url text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_sources_chatbot_idx
  on public.knowledge_sources (chatbot_id);

drop trigger if exists set_knowledge_sources_updated_at on public.knowledge_sources;
create trigger set_knowledge_sources_updated_at
before update on public.knowledge_sources
for each row
execute function public.set_updated_at();

-- 3. knowledge_chunks: text ke tukde + embeddings
create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_source_idx
  on public.knowledge_chunks (source_id);

create index if not exists knowledge_chunks_chatbot_idx
  on public.knowledge_chunks (chatbot_id);

create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- 4. RLS
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;

grant select, insert, update, delete on public.knowledge_sources to authenticated;
grant select, delete on public.knowledge_chunks to authenticated;

-- knowledge_sources policies
-- (chatbots table ki RLS pehle se sirf apni organization ke chatbots dikhati hai)
create policy "Members can view knowledge sources"
on public.knowledge_sources
for select
to authenticated
using (
  exists (
    select 1 from public.chatbots c
    where c.id = knowledge_sources.chatbot_id
  )
);

create policy "Owners and admins can add knowledge sources"
on public.knowledge_sources
for insert
to authenticated
with check (
  exists (
    select 1 from public.chatbots c
    where c.id = knowledge_sources.chatbot_id
      and private.can_manage_org(c.organization_id)
  )
);

create policy "Owners and admins can update knowledge sources"
on public.knowledge_sources
for update
to authenticated
using (
  exists (
    select 1 from public.chatbots c
    where c.id = knowledge_sources.chatbot_id
      and private.can_manage_org(c.organization_id)
  )
)
with check (
  exists (
    select 1 from public.chatbots c
    where c.id = knowledge_sources.chatbot_id
      and private.can_manage_org(c.organization_id)
  )
);

create policy "Owners and admins can delete knowledge sources"
on public.knowledge_sources
for delete
to authenticated
using (
  exists (
    select 1 from public.chatbots c
    where c.id = knowledge_sources.chatbot_id
      and private.can_manage_org(c.organization_id)
  )
);

-- knowledge_chunks policies (chunks server banata hai, user sirf dekh/delete kar sakta hai)
create policy "Members can view knowledge chunks"
on public.knowledge_chunks
for select
to authenticated
using (
  exists (
    select 1 from public.chatbots c
    where c.id = knowledge_chunks.chatbot_id
  )
);

create policy "Owners and admins can delete knowledge chunks"
on public.knowledge_chunks
for delete
to authenticated
using (
  exists (
    select 1 from public.chatbots c
    where c.id = knowledge_chunks.chatbot_id
      and private.can_manage_org(c.organization_id)
  )
);

-- 5. Similarity search function (RLS lagu rehti hai, kyunki security invoker hai)
create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(1536),
  match_chatbot_id uuid,
  match_count integer default 5
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    kc.id,
    kc.source_id,
    kc.content,
    1 - (kc.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.chatbot_id = match_chatbot_id
    and kc.embedding is not null
  order by kc.embedding operator(extensions.<=>) query_embedding
  limit least(match_count, 20);
$$;

-- 6. Storage bucket (PDF/TXT upload). File path: <chatbot_id>/<filename>
insert into storage.buckets (id, name, public, file_size_limit)
values ('knowledge-files', 'knowledge-files', false, 10485760)
on conflict (id) do nothing;

create policy "Members can read knowledge files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'knowledge-files'
  and exists (
    select 1 from public.chatbots c
    where c.id::text = (storage.foldername(name))[1]
  )
);

create policy "Owners and admins can upload knowledge files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'knowledge-files'
  and exists (
    select 1 from public.chatbots c
    where c.id::text = (storage.foldername(name))[1]
      and private.can_manage_org(c.organization_id)
  )
);

create policy "Owners and admins can delete knowledge files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'knowledge-files'
  and exists (
    select 1 from public.chatbots c
    where c.id::text = (storage.foldername(name))[1]
      and private.can_manage_org(c.organization_id)
  )
);

notify pgrst, 'reload schema';