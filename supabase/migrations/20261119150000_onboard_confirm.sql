-- Tågläge: användaren bekräftar "Jag är på tåget" (gäller till ankomst + resten av resan). En rad per hushåll.
create table if not exists public.onboard_confirm (
  household_id text primary key default public.my_household(),
  ident text not null,
  dep timestamptz not null,
  until timestamptz not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.onboard_confirm enable row level security;
create policy onboard_confirm_read on public.onboard_confirm for select to authenticated
  using (household_id = (select public.my_household()));
create policy onboard_confirm_insert on public.onboard_confirm for insert to authenticated
  with check (household_id = (select public.my_household()) and created_by = (select auth.uid()));
create policy onboard_confirm_update on public.onboard_confirm for update to authenticated
  using (household_id = (select public.my_household()))
  with check (household_id = (select public.my_household()) and created_by = (select auth.uid()));
create policy onboard_confirm_delete on public.onboard_confirm for delete to authenticated
  using (household_id = (select public.my_household()));
