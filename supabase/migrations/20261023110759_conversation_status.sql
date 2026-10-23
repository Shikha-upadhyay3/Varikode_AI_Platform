alter table public.conversations
  add column if not exists status text not null default 'resolved'
    check (status in ('resolved', 'handoff')),
  add column if not exists handoff_at timestamptz;

create or replace function public.dashboard_stats(p_org uuid, p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_from timestamptz := now() - make_interval(days => p_days);
  v_prev timestamptz := now() - make_interval(days => p_days * 2);
  v_result jsonb;
begin
  if not exists (
    select 1 from memberships m
    where m.organization_id = p_org and m.user_id = auth.uid()
  ) then
    raise exception 'not a member of this organization';
  end if;

  select jsonb_build_object(
    'conversations', jsonb_build_object(
      'current',  (select count(*) from conversations c where c.organization_id = p_org and c.created_at >= v_from),
      'previous', (select count(*) from conversations c where c.organization_id = p_org and c.created_at >= v_prev and c.created_at < v_from)
    ),
    'outcomes', jsonb_build_object(
      'resolved',      (select count(*) from conversations c where c.organization_id = p_org and c.created_at >= v_from and c.status = 'resolved'),
      'handoff',       (select count(*) from conversations c where c.organization_id = p_org and c.created_at >= v_from and c.status = 'handoff'),
      'prev_resolved', (select count(*) from conversations c where c.organization_id = p_org and c.created_at >= v_prev and c.created_at < v_from and c.status = 'resolved'),
      'prev_handoff',  (select count(*) from conversations c where c.organization_id = p_org and c.created_at >= v_prev and c.created_at < v_from and c.status = 'handoff')
    ),
    'messages_answered', jsonb_build_object(
      'current',  (select count(*) from messages ms join conversations c on c.id = ms.conversation_id
                   where c.organization_id = p_org and ms.role = 'assistant' and ms.created_at >= v_from),
      'previous', (select count(*) from messages ms join conversations c on c.id = ms.conversation_id
                   where c.organization_id = p_org and ms.role = 'assistant'
                     and ms.created_at >= v_prev and ms.created_at < v_from)
    ),
    'knowledge_sources', jsonb_build_object(
      'total', (select count(*) from knowledge_sources k join chatbots b on b.id = k.chatbot_id
                where b.organization_id = p_org),
      'added_this_month', (select count(*) from knowledge_sources k join chatbots b on b.id = k.chatbot_id
                where b.organization_id = p_org and k.created_at >= date_trunc('month', now()))
    ),
    'month_messages', (select count(*) from messages ms join conversations c on c.id = ms.conversation_id
                where c.organization_id = p_org and ms.role = 'assistant'
                  and ms.created_at >= date_trunc('month', now())),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', d.day,
               'count', coalesce(x.cnt, 0),
               'resolved', coalesce(x.res, 0),
               'handoff', coalesce(x.hand, 0)) order by d.day), '[]'::jsonb)
      from (select generate_series(v_from::date, now()::date, interval '1 day')::date as day) d
      left join (
        select c.created_at::date as day,
               count(*) as cnt,
               count(*) filter (where c.status = 'resolved') as res,
               count(*) filter (where c.status = 'handoff') as hand
        from conversations c
        where c.organization_id = p_org and c.created_at >= v_from
        group by 1
      ) x on x.day = d.day
    ),
    'recent_conversations', (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select c.id, c.title, c.created_at
        from conversations c
        where c.organization_id = p_org
        order by c.created_at desc limit 5
      ) r
    ),
    'recent_sources', (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select k.id, k.title, k.source_type, k.status, k.created_at
        from knowledge_sources k join chatbots b on b.id = k.chatbot_id
        where b.organization_id = p_org
        order by k.created_at desc limit 5
      ) r
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.dashboard_stats(uuid, int) from public, anon;
grant execute on function public.dashboard_stats(uuid, int) to authenticated;
