-- Fix: match the chatbot id against the FILE path (objects.name),
-- not the chatbot's name column.

drop policy if exists "Owners and admins can upload knowledge files" on storage.objects;
drop policy if exists "Members can read knowledge files" on storage.objects;
drop policy if exists "Owners and admins can delete knowledge files" on storage.objects;

create policy "Owners and admins can upload knowledge files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'knowledge-files'
    and exists (
      select 1 from public.chatbots c
      where c.id::text = (storage.foldername(objects.name))[1]
        and private.can_manage_org(c.organization_id)
    )
  );

create policy "Owners and admins can delete knowledge files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'knowledge-files'
    and exists (
      select 1 from public.chatbots c
      where c.id::text = (storage.foldername(objects.name))[1]
        and private.can_manage_org(c.organization_id)
    )
  );

create policy "Members can read knowledge files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'knowledge-files'
    and exists (
      select 1
      from public.chatbots c
      join public.memberships m on m.organization_id = c.organization_id
      where c.id::text = (storage.foldername(objects.name))[1]
        and m.user_id = auth.uid()
    )
  );