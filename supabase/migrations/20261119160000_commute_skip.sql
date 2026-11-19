-- Pendling: avgångar som användaren valt att dölja ("Tar inte det här"). Gäller hushållet, rensas efter avgång.
create table if not exists public.commute_skip (
  household_id text not null default public.my_household(),
  ident text not null,
  dep timestamptz not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (household_id, ident, dep)
);
alter table public.commute_skip enable row level security;
create policy commute_skip_read on public.commute_skip for select to authenticated
  using (household_id = (select public.my_household()));
create policy commute_skip_insert on public.commute_skip for insert to authenticated
  with check (household_id = (select public.my_household()) and created_by = (select auth.uid()));
create policy commute_skip_delete on public.commute_skip for delete to authenticated
  using (household_id = (select public.my_household()));
