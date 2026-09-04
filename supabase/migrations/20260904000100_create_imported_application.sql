begin;

-- Creates one imported application aggregate as a single PostgreSQL statement.
-- Any failure, including the audit-event insert, rolls the job and application
-- back with it so the caller can classify the source row exactly once.
create function public.create_imported_application(
  p_job jsonb,
  p_application jsonb,
  p_batch_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch_source public.job_source;
  v_status public.application_status;
  v_now timestamptz := now();
  v_job public.jobs%rowtype;
  v_application public.applications%rowtype;
  v_event public.application_events%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select source into v_batch_source
    from public.import_batches
    where id = p_batch_id and user_id = v_user_id;
  if not found then
    raise exception 'Import batch not found' using errcode = 'P0002';
  end if;

  if nullif(btrim(p_job->>'title'), '') is null
     or nullif(btrim(p_job->>'company'), '') is null
     or nullif(btrim(p_job->>'description'), '') is null then
    raise exception 'A job requires a title, company, and description'
      using errcode = '23514';
  end if;

  insert into public.jobs (
    user_id, title, company, location, workplace_type, employment_type,
    description, source, source_url, external_id, salary_min, salary_max,
    salary_currency, published_at
  ) values (
    v_user_id,
    btrim(p_job->>'title'),
    btrim(p_job->>'company'),
    nullif(btrim(p_job->>'location'), ''),
    coalesce(nullif(p_job->>'workplaceType', ''), 'unspecified')::public.workplace_type,
    coalesce(nullif(p_job->>'employmentType', ''), 'unspecified')::public.employment_type,
    btrim(p_job->>'description'),
    v_batch_source,
    nullif(btrim(p_job->>'sourceUrl'), ''),
    nullif(btrim(p_job->>'externalId'), ''),
    nullif(p_job->>'salaryMin', '')::numeric,
    nullif(p_job->>'salaryMax', '')::numeric,
    upper(nullif(btrim(p_job->>'salaryCurrency'), '')),
    nullif(p_job->>'publishedAt', '')::timestamptz
  ) returning * into v_job;

  v_status := coalesce(
    nullif(p_application->>'status', ''),
    'saved'
  )::public.application_status;
  insert into public.applications (
    user_id, job_id, status, cv_version_id, notes, applied_at, last_activity_at
  ) values (
    v_user_id,
    v_job.id,
    v_status,
    nullif(p_application->>'cvVersionId', '')::uuid,
    nullif(btrim(p_application->>'notes'), ''),
    coalesce(
      nullif(p_application->>'appliedAt', '')::timestamptz,
      case when v_status = 'applied' then v_now else null end
    ),
    v_now
  ) returning * into v_application;

  insert into public.application_events (
    user_id, application_id, type, title, from_status, to_status,
    occurred_at, metadata
  ) values (
    v_user_id,
    v_application.id,
    'imported',
    'Role imported',
    null,
    v_status,
    v_now,
    jsonb_build_object('batchId', p_batch_id)
  ) returning * into v_event;

  return jsonb_build_object(
    'application', to_jsonb(v_application),
    'job', to_jsonb(v_job),
    'events', jsonb_build_array(to_jsonb(v_event))
  );
end;
$$;

revoke all on function public.create_imported_application(jsonb, jsonb, uuid)
  from public, anon;
grant execute on function public.create_imported_application(jsonb, jsonb, uuid) to authenticated;

commit;
