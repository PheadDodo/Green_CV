-- Per-account LLM preferences. API credentials are encrypted by the server before
-- they reach PostgreSQL; the application exposes only a hasApiKey flag.
create table public.llm_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null check (mode in ('default', 'api', 'local')),
  protocol text not null check (protocol in ('openai', 'anthropic', 'ollama')),
  base_url text not null check (length(base_url) between 1 and 2048),
  model text not null check (length(model) between 1 and 200),
  api_key_encrypted text,
  updated_at timestamptz not null default now(),
  constraint llm_settings_ciphertext_format check (
    api_key_encrypted is null or (
      length(api_key_encrypted) between 50 and 8192 and api_key_encrypted like 'v1:%'
    )
  ),
  constraint llm_settings_api_requires_key check (mode <> 'api' or api_key_encrypted is not null),
  constraint llm_settings_default_has_no_key check (mode <> 'default' or api_key_encrypted is null)
);

create trigger llm_settings_set_updated_at before update on public.llm_settings
  for each row execute function public.set_updated_at();

alter table public.llm_settings enable row level security;
alter table public.llm_settings force row level security;
create policy "Users own their LLM settings" on public.llm_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.llm_settings to authenticated;

-- Null metadata preserves historical evaluations. New reservations capture the
-- selected provider so cache reuse and API quotas follow the chosen settings.
alter table public.evaluations
  add column provider_mode text check (provider_mode in ('api', 'local', 'demo')),
  add column provider_fingerprint text check (
    provider_fingerprint is null or length(provider_fingerprint) = 64
  );
