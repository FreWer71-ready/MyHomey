-- Uppskattat drickfönster (beräknas i Trandvine): i fönstret nu och efter fönstret.
alter table public.wine_cellar add column ready int, add column past int;
