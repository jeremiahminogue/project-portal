-- Chat operational hardening.
-- Keeps chat subject activity current without requiring broad client-side
-- update permissions, and allows project admins to delete chat records.

create or replace function public.touch_chat_subject_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_subjects
     set last_message_at = new.created_at,
         updated_at = now()
   where id = new.subject_id;
  return new;
end;
$$;

revoke all on function public.touch_chat_subject_last_message_at() from public;

drop trigger if exists chat_messages_touch_subject on public.chat_messages;
create trigger chat_messages_touch_subject
  after insert on public.chat_messages
  for each row execute function public.touch_chat_subject_last_message_at();

drop policy if exists "Project admins can delete chat subjects" on public.chat_subjects;
create policy "Project admins can delete chat subjects"
  on public.chat_subjects for delete using (
    public.project_role(project_id, auth.uid()) = 'admin'
  );

drop policy if exists "Project admins can delete chat messages" on public.chat_messages;
create policy "Project admins can delete chat messages"
  on public.chat_messages for delete using (
    exists (
      select 1
      from public.chat_subjects cs
      where cs.id = chat_messages.subject_id
        and public.project_role(cs.project_id, auth.uid()) = 'admin'
    )
  );
