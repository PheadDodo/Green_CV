-- Initial GreenCV schema (14-digit Supabase migration version).
begin;

create extension if not exists pgcrypto;

create type public.application_status as enum (
  'saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'archived'
);
create type public.workplace_type as enum ('remote', 'hybrid', 'onsite', 'unspecified');
create type public.employment_type as enum (
  'full_time', 'part_time', 'contract', 'internship', 'temporary', 'unspecified'
);
create type public.job_source as enum ('manual', 'url', 'linkedin', 'indeed', 'csv', 'api');
create type public.application_event_type as enum (
  'created', 'status_changed', 'note', 'cv_attached', 'evaluation_completed',
  'interview_scheduled', 'follow_up', 'imported'
);
create type public.evaluation_status as enum ('pending', 'running', 'completed', 'failed');
create type public.evaluation_recommendation as enum ('apply', 'consider', 'skip');
create type public.reminder_status as enum ('pending', 'completed', 'dismissed');
create type public.import_batch_status as enum (
  'pending', 'processing', 'completed', 'partial', 'failed'
);
create type public.automation_rule_type as enum (
  'auto_evaluate', 'follow_up', 'interview_prep'
);
create type public.automation_run_status as enum (
  'pending', 'running', 'succeeded', 'failed', 'cancelled'
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 240),
  company text not null check (length(btrim(company)) between 1 and 240),
  location text,
  workplace_type public.workplace_type not null default 'unspecified',
  employment_type public.employment_type not null default 'unspecified',
  description text not null check (length(btrim(description)) > 0),
  source public.job_source not null default 'manual',
  source_url text,
  external_id text,
  salary_min numeric(14, 2) check (salary_min is null or salary_min >= 0),
  salary_max numeric(14, 2) check (salary_max is null or salary_max >= 0),
  salary_currency text check (salary_currency is null or salary_currency ~ '^[A-Z]{3}$'),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

create unique index jobs_user_source_external_unique
  on public.jobs (user_id, source, external_id)
  where external_id is not null;
create index jobs_user_created_idx on public.jobs (user_id, created_at desc);
create index jobs_user_company_idx on public.jobs (user_id, lower(company));

create table public.cv_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  summary text,
  content text not null check (length(btrim(content)) > 0),
  file_name text,
  storage_path text,
  mime_type text,
  skills text[] not null default '{}',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index cv_versions_one_default_per_user
  on public.cv_versions (user_id)
  where is_default;
create index cv_versions_user_updated_idx on public.cv_versions (user_id, updated_at desc);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null,
  status public.application_status not null default 'saved',
  cv_version_id uuid,
  notes text,
  applied_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, job_id),
  unique (user_id, job_id),
  constraint applications_job_owner_fk
    foreign key (job_id, user_id) references public.jobs(id, user_id) on delete cascade,
  constraint applications_cv_owner_fk
    foreign key (cv_version_id, user_id) references public.cv_versions(id, user_id)
    on delete set null (cv_version_id)
);

create index applications_user_status_activity_idx
  on public.applications (user_id, status, last_activity_at desc);
create index applications_job_idx on public.applications (job_id);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null,
  type public.application_event_type not null,
  title text not null check (length(btrim(title)) between 1 and 240),
  details text,
  from_status public.application_status,
  to_status public.application_status,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint application_events_application_owner_fk
    foreign key (application_id, user_id)
    references public.applications(id, user_id) on delete cascade
);

create index application_events_application_occurred_idx
  on public.application_events (application_id, occurred_at desc);
create index application_events_user_occurred_idx
  on public.application_events (user_id, occurred_at desc);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null,
  job_id uuid not null,
  cv_version_id uuid,
  status public.evaluation_status not null default 'pending',
  recommendation public.evaluation_recommendation,
  overall_score smallint check (overall_score between 0 and 100),
  summary text,
  strengths jsonb not null default '[]'::jsonb check (jsonb_typeof(strengths) = 'array'),
  gaps jsonb not null default '[]'::jsonb check (jsonb_typeof(gaps) = 'array'),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  suggested_edits jsonb not null default '[]'::jsonb check (jsonb_typeof(suggested_edits) = 'array'),
  model text,
  prompt_version text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id),
  constraint evaluations_application_owner_fk
    foreign key (application_id, user_id, job_id)
    references public.applications(id, user_id, job_id) on delete cascade,
  constraint evaluations_job_owner_fk
    foreign key (job_id, user_id) references public.jobs(id, user_id) on delete cascade,
  constraint evaluations_cv_owner_fk
    foreign key (cv_version_id, user_id) references public.cv_versions(id, user_id)
    on delete set null (cv_version_id),
  check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  )
);

create index evaluations_application_created_idx
  on public.evaluations (application_id, created_at desc);
create index evaluations_user_job_created_idx
  on public.evaluations (user_id, job_id, created_at desc);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid,
  title text not null check (length(btrim(title)) between 1 and 240),
  notes text,
  due_at timestamptz not null,
  status public.reminder_status not null default 'pending',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint reminders_application_owner_fk
    foreign key (application_id, user_id)
    references public.applications(id, user_id) on delete cascade,
  check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  )
);

create index reminders_user_status_due_idx on public.reminders (user_id, status, due_at);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source public.job_source not null,
  file_name text,
  status public.import_batch_status not null default 'pending',
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  succeeded_rows integer not null default 0 check (succeeded_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id),
  check (processed_rows <= total_rows),
  check (succeeded_rows + failed_rows <= processed_rows)
);

create index import_batches_user_created_idx
  on public.import_batches (user_id, created_at desc);

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.automation_rule_type not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, type),
  unique (user_id, type)
);

create index automation_rules_user_enabled_idx on public.automation_rules (user_id, enabled);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid,
  application_id uuid,
  type public.automation_rule_type not null,
  status public.automation_run_status not null default 'pending',
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 500),
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint automation_runs_rule_owner_type_fk
    foreign key (rule_id, user_id, type)
    references public.automation_rules(id, user_id, type)
    on delete set null (rule_id),
  constraint automation_runs_application_owner_fk
    foreign key (application_id, user_id)
    references public.applications(id, user_id)
    on delete set null (application_id),
  check (
    (status in ('succeeded', 'failed', 'cancelled') and completed_at is not null)
    or (status in ('pending', 'running') and completed_at is null)
  )
);

create index automation_runs_user_status_schedule_idx
  on public.automation_runs (user_id, status, scheduled_at);
create index automation_runs_application_created_idx
  on public.automation_runs (application_id, created_at desc);

insert into public.automation_rules (user_id, type, enabled, config)
select users.id, defaults.type, true, defaults.config
from auth.users as users
cross join (
  values
    ('auto_evaluate'::public.automation_rule_type, '{"minimumDescriptionLength":40}'::jsonb),
    ('follow_up'::public.automation_rule_type, '{"delayHours":168}'::jsonb),
    ('interview_prep'::public.automation_rule_type, '{"leadHours":24}'::jsonb)
) as defaults(type, config)
on conflict (user_id, type) do nothing;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger cv_versions_set_updated_at before update on public.cv_versions
  for each row execute function public.set_updated_at();
create trigger applications_set_updated_at before update on public.applications
  for each row execute function public.set_updated_at();
create trigger evaluations_set_updated_at before update on public.evaluations
  for each row execute function public.set_updated_at();
create trigger reminders_set_updated_at before update on public.reminders
  for each row execute function public.set_updated_at();
create trigger import_batches_set_updated_at before update on public.import_batches
  for each row execute function public.set_updated_at();
create trigger automation_rules_set_updated_at before update on public.automation_rules
  for each row execute function public.set_updated_at();
create trigger automation_runs_set_updated_at before update on public.automation_runs
  for each row execute function public.set_updated_at();

create function public.seed_default_automation_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.automation_rules (user_id, type, enabled, config)
  values
    (new.id, 'auto_evaluate', true, '{"minimumDescriptionLength":40}'::jsonb),
    (new.id, 'follow_up', true, '{"delayHours":168}'::jsonb),
    (new.id, 'interview_prep', true, '{"leadHours":24}'::jsonb)
  on conflict (user_id, type) do nothing;
  return new;
end;
$$;

create trigger auth_users_seed_automation_rules
  after insert on auth.users
  for each row execute function public.seed_default_automation_rules();

create function public.keep_single_default_cv()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.is_default then
    update public.cv_versions
      set is_default = false
      where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

create trigger cv_versions_keep_single_default
  before insert or update of is_default on public.cv_versions
  for each row execute function public.keep_single_default_cv();

create function public.touch_application_from_event()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.applications
    set last_activity_at = greatest(last_activity_at, new.occurred_at)
    where id = new.application_id and user_id = new.user_id;
  return new;
end;
$$;

create trigger application_events_touch_application
  after insert on public.application_events
  for each row execute function public.touch_application_from_event();

create function public.create_application_with_job(
  p_job jsonb,
  p_application jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_job_id uuid;
  v_application_id uuid;
  v_status public.application_status;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
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
    coalesce(nullif(p_job->>'source', ''), 'manual')::public.job_source,
    nullif(btrim(p_job->>'sourceUrl'), ''),
    nullif(btrim(p_job->>'externalId'), ''),
    nullif(p_job->>'salaryMin', '')::numeric,
    nullif(p_job->>'salaryMax', '')::numeric,
    upper(nullif(btrim(p_job->>'salaryCurrency'), '')),
    nullif(p_job->>'publishedAt', '')::timestamptz
  ) returning id into v_job_id;

  v_status := coalesce(nullif(p_application->>'status', ''), 'saved')::public.application_status;
  insert into public.applications (
    user_id, job_id, status, cv_version_id, notes, applied_at, last_activity_at
  ) values (
    v_user_id,
    v_job_id,
    v_status,
    nullif(p_application->>'cvVersionId', '')::uuid,
    nullif(btrim(p_application->>'notes'), ''),
    coalesce(
      nullif(p_application->>'appliedAt', '')::timestamptz,
      case when v_status = 'applied' then v_now else null end
    ),
    v_now
  ) returning id into v_application_id;

  insert into public.application_events (
    user_id, application_id, type, title, from_status, to_status, occurred_at
  ) values (
    v_user_id,
    v_application_id,
    'created',
    case when v_status = 'saved' then 'Role saved'
         when v_status = 'applied' then 'Application added'
         else 'Application added as ' || v_status::text end,
    null,
    v_status,
    v_now
  );
  return v_application_id;
end;
$$;

create function public.transition_application_status(
  p_application_id uuid,
  p_to_status public.application_status,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_from_status public.application_status;
  v_now timestamptz := now();
  v_title text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select status into v_from_status
    from public.applications
    where id = p_application_id and user_id = v_user_id
    for update;
  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  v_title := case p_to_status
    when 'saved' then 'Role saved'
    when 'applied' then 'Application submitted'
    when 'screening' then 'Moved to screening'
    when 'interview' then 'Interview scheduled'
    when 'offer' then 'Offer received'
    when 'rejected' then 'Application closed'
    when 'withdrawn' then 'Application withdrawn'
    when 'archived' then 'Application archived'
  end;

  update public.applications
    set status = p_to_status,
        notes = coalesce(nullif(btrim(p_notes), ''), notes),
        applied_at = case
          when p_to_status = 'applied' and applied_at is null then v_now
          else applied_at
        end,
        last_activity_at = v_now
    where id = p_application_id and user_id = v_user_id;

  insert into public.application_events (
    user_id, application_id, type, title, details,
    from_status, to_status, occurred_at
  ) values (
    v_user_id, p_application_id, 'status_changed', v_title,
    nullif(btrim(p_notes), ''), v_from_status, p_to_status, v_now
  );
  return p_application_id;
end;
$$;

alter table public.jobs enable row level security;
alter table public.cv_versions enable row level security;
alter table public.applications enable row level security;
alter table public.application_events enable row level security;
alter table public.evaluations enable row level security;
alter table public.reminders enable row level security;
alter table public.import_batches enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;

alter table public.jobs force row level security;
alter table public.cv_versions force row level security;
alter table public.applications force row level security;
alter table public.application_events force row level security;
alter table public.evaluations force row level security;
alter table public.reminders force row level security;
alter table public.import_batches force row level security;
alter table public.automation_rules force row level security;
alter table public.automation_runs force row level security;

create policy "Users own their jobs" on public.jobs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users own their CV versions" on public.cv_versions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users own their applications" on public.applications
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users own their application events" on public.application_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users own their evaluations" on public.evaluations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users own their reminders" on public.reminders
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users own their import batches" on public.import_batches
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users own their automation rules" on public.automation_rules
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users own their automation runs" on public.automation_runs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on
  public.jobs,
  public.cv_versions,
  public.applications,
  public.application_events,
  public.evaluations,
  public.reminders,
  public.import_batches,
  public.automation_rules,
  public.automation_runs
from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, delete on
  public.jobs,
  public.cv_versions
to authenticated;
grant update (name, is_default) on public.cv_versions to authenticated;
grant select, insert on public.application_events to authenticated;
grant select, insert, update, delete on
  public.applications,
  public.evaluations,
  public.reminders,
  public.import_batches,
  public.automation_rules,
  public.automation_runs
to authenticated;

revoke all on function public.seed_default_automation_rules() from public, anon, authenticated;

revoke all on function public.create_application_with_job(jsonb, jsonb) from public, anon;
revoke all on function public.transition_application_status(uuid, public.application_status, text)
  from public, anon;
grant execute on function public.create_application_with_job(jsonb, jsonb) to authenticated;
grant execute on function public.transition_application_status(uuid, public.application_status, text)
  to authenticated;

-- CV binaries remain private. Object names must begin with the authenticated user's id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv-files',
  'cv-files',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Users read their own CV files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cv-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users upload their own CV files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cv-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users delete their own CV files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cv-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
