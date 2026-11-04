revoke update on public.organizations from authenticated;
grant update (name, logo_url) on public.organizations to authenticated;

revoke execute on function public.match_knowledge_chunks from public, anon;
grant execute on function public.match_knowledge_chunks to authenticated, service_role;