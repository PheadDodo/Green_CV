begin;

update storage.buckets
set public = false,
    file_size_limit = 4194304,
    allowed_mime_types = array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ]
where id = 'cv-files';

drop policy if exists "Users read their own CV files" on storage.objects;
drop policy if exists "Users upload their own CV files" on storage.objects;
drop policy if exists "Users delete their own CV files" on storage.objects;
drop policy if exists "Users update their own CV files" on storage.objects;

-- Existing owner-scoped, filename-bearing objects remain readable and deletable.
-- All new uploads must use the opaque two-folder shape enforced by the insert policy.
create policy "Users read their own CV files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cv-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      cardinality(storage.foldername(name)) = 1
      or (
        cardinality(storage.foldername(name)) = 2
        and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and storage.filename(name) in ('original.pdf', 'original.docx', 'original.md', 'original.txt')
      )
    )
  );

create policy "Users upload their own CV files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cv-files'
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and storage.filename(name) in ('original.pdf', 'original.docx', 'original.md', 'original.txt')
  );

create policy "Users delete their own CV files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cv-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      cardinality(storage.foldername(name)) = 1
      or (
        cardinality(storage.foldername(name)) = 2
        and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and storage.filename(name) in ('original.pdf', 'original.docx', 'original.md', 'original.txt')
      )
    )
  );

alter table public.cv_versions
  drop constraint if exists cv_versions_storage_path_shape;
alter table public.cv_versions
  add constraint cv_versions_storage_path_shape
  check (
    storage_path is null
    or split_part(storage_path, '/', 1) = user_id::text
  ) not valid;

commit;
