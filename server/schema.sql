create table if not exists mindmaps (
  id text primary key,
  title text not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
