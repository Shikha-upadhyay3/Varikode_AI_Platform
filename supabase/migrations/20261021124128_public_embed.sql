-- 1. chatbots me embed ke columns
alter table public.chatbots
  add column if not exists public_key text unique,
  add column if not exists allowed_origins text not null default '',
  add column if not exists system_prompt text;

-- 2. conversations: visitor ki chat me login user nahi hota
alter table public.conversations alter column user_id drop not null;
alter table public.conversations
  add column if not exists chatbot_id uuid references public.chatbots(id) on delete set null,
  add column if not exists visitor_id text;
create index if not exists conversations_chatbot_idx on public.conversations (chatbot_id);

-- 3. Organization ke members apni org ki saari chats dekh sakein (visitors ki bhi)
create policy "org members read conversations" on public.conversations
  for select using (exists (
    select 1 from public.memberships m
    where m.organization_id = conversations.organization_id and m.user_id = auth.uid()
  ));

create policy "org members read messages" on public.messages
  for select using (exists (
    select 1 from public.conversations c
    join public.memberships m on m.organization_id = c.organization_id
    where c.id = messages.conversation_id and m.user_id = auth.uid()
  ));

-- 4. Visitor ke liye daily usage
create table public.visitor_usage_daily (
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  visitor_id text not null,
  day date not null default (now() at time zone 'utc')::date,
  requests int not null default 0,
  tokens int not null default 0,
  primary key (chatbot_id, visitor_id, day)
);
alter table public.visitor_usage_daily enable row level security; -- koi policy nahi: sirf service role

create or replace function public.record_visitor_usage(p_bot uuid, p_visitor text, p_tokens int)
returns void language sql security definer set search_path = public as $$
  insert into visitor_usage_daily (chatbot_id, visitor_id, day, requests, tokens)
  values (p_bot, p_visitor, (now() at time zone 'utc')::date, 1, p_tokens)
  on conflict (chatbot_id, visitor_id, day)
  do update set requests = visitor_usage_daily.requests + 1,
                tokens = visitor_usage_daily.tokens + p_tokens;
$$;
revoke execute on function public.record_visitor_usage from public, anon, authenticated;