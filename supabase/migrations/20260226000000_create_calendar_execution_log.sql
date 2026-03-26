create table if not exists public.calendar_execution_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  execution_mode text not null check (execution_mode in ('calendar_description', 'clickup_task')),
  proposal_payload jsonb not null default '{}'::jsonb,
  calendar_event_id text null,
  clickup_task_id text null,
  status text not null,
  error_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists calendar_execution_log_idempotency_key_idx
  on public.calendar_execution_log (idempotency_key);

create index if not exists calendar_execution_log_user_created_idx
  on public.calendar_execution_log (user_id, created_at desc);

alter table public.calendar_execution_log enable row level security;

drop policy if exists "Users can select own calendar execution logs" on public.calendar_execution_log;
create policy "Users can select own calendar execution logs"
  on public.calendar_execution_log
  for select
  using (auth.uid() = user_id);

-- service role inserts/updates bypass RLS automatically.
