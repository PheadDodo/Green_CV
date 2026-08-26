begin;

-- Backfill one selected CV for users who uploaded versions before selection existed.
with ranked as (
  select
    id,
    user_id,
    row_number() over (partition by user_id order by updated_at desc, id) as selection_rank,
    bool_or(is_default) over (partition by user_id) as has_selection
  from public.cv_versions
)
update public.cv_versions as cv
set is_default = true
from ranked
where cv.id = ranked.id
  and ranked.selection_rank = 1
  and not ranked.has_selection;

-- The first upload is selected automatically. Later uploads do not replace an
-- explicit selection, and deleting the selected CV does not silently promote one.
create or replace function public.keep_single_default_cv()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT'
     and not new.is_default
     and not exists (
       select 1
       from public.cv_versions as existing
       where existing.user_id = new.user_id
     ) then
    new.is_default := true;
  end if;

  if new.is_default then
    update public.cv_versions
      set is_default = false
      where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

commit;
