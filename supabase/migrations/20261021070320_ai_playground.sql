-- Conversations
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  system_prompt text,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.conversations (user_id, updated_at desc);
create index on public.conversations (organization_id);

-- Messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  prompt_tokens int,
  completion_tokens int,
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

-- Daily usage (quota)
create table public.usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  requests int not null default 0,
  tokens int not null default 0,
  primary key (user_id, day)
);

-- RLS on
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.usage_daily enable row level security;

-- Conversations: sirf apni, aur sirf us organization me jiska user member hai
create policy "own conversations select" on public.conversations
  for select using (user_id = auth.uid());

create policy "own conversations insert" on public.conversations
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.memberships m
      where m.organization_id = conversations.organization_id
        and m.user_id = auth.uid()
    )
  );

create policy "own conversations delete" on public.conversations
  for delete using (user_id = auth.uid());

-- Messages: sirf apni conversation ke messages padh sako
create policy "own messages select" on public.messages
  for select using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  ));

-- Usage: sirf apna dekh sako
create policy "own usage select" on public.usage_daily
  for select using (user_id = auth.uid());

-- Messages/usage ki insert policy nahi hai, kyunki sirf Edge Function (service role) likhega

-- Atomic usage counter
create or replace function public.record_usage(p_user uuid, p_tokens int)
returns void language sql security definer set search_path = public as $$
  insert into usage_daily (user_id, day, requests, tokens)
  values (p_user, (now() at time zone 'utc')::date, 1, p_tokens)
  on conflict (user_id, day)
  do update set requests = usage_daily.requests + 1,
                tokens = usage_daily.tokens + p_tokens;
$$;
revoke execute on function public.record_usage from public, anon, authenticated;