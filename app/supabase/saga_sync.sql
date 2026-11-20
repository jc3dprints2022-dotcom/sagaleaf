-- public.saga_sync: one row per user and book. Run in the Supabase SQL editor (the app never runs this).
-- If the table already exists from the encrypted version, only the DELETE policy below is new:
-- "data" stays jsonb, and old rows ({ v: 1, box: … }) are ignored by the app and overwritten book by book.

create table if not exists public.saga_sync (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
alter table public.saga_sync enable row level security;

drop policy if exists "own rows: read"   on public.saga_sync;
drop policy if exists "own rows: insert" on public.saga_sync;
drop policy if exists "own rows: update" on public.saga_sync;
drop policy if exists "own rows: delete" on public.saga_sync;
create policy "own rows: read"   on public.saga_sync for select using (user_id = auth.uid());
create policy "own rows: insert" on public.saga_sync for insert with check (user_id = auth.uid());
create policy "own rows: update" on public.saga_sync for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows: delete" on public.saga_sync for delete using (user_id = auth.uid());   -- "Delete account and synced data"

-- updated_at is the server's clock (the app asks "what changed since"): keep it current on every write.
create or replace function public.saga_sync_touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists saga_sync_touch on public.saga_sync;
create trigger saga_sync_touch before insert or update on public.saga_sync for each row execute function public.saga_sync_touch();

-- Optional tidy-up of the encrypted version's marker row:
-- delete from public.saga_sync where book_id = '_saga_key_check';
