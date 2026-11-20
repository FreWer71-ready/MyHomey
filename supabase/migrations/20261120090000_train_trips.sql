-- Tågresor som användaren varit på ("Jag är på tåget"): underlag för statistik (resor, mil, förseningar)
-- och lista över resor med 20 min försening eller mer att begära ersättning för. En rad per hushåll, tåg och avgång.
create table if not exists public.train_trips (
  household_id text not null default public.my_household(),
  ident text not null,
  dep timestamptz not null,
  arr timestamptz not null,
  from_sig text not null,
  to_sig text not null,
  product text,
  km numeric not null default 109,
  actual_arr timestamptz,
  delay_min int check (delay_min >= 0),
  canceled boolean not null default false,
  settled boolean not null default false,
  claim text not null default 'none' check (claim in ('none', 'sent', 'paid', 'rejected')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (household_id, ident, dep)
);
create index if not exists train_trips_dep on public.train_trips (household_id, dep desc);
alter table public.train_trips enable row level security;
create policy train_trips_read on public.train_trips for select to authenticated
  using (household_id = (select public.my_household()));
create policy train_trips_insert on public.train_trips for insert to authenticated
  with check (household_id = (select public.my_household()) and created_by = (select auth.uid()));
create policy train_trips_update on public.train_trips for update to authenticated
  using (household_id = (select public.my_household()))
  with check (household_id = (select public.my_household()));
create policy train_trips_delete on public.train_trips for delete to authenticated
  using (household_id = (select public.my_household()));
