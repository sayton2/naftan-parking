-- Naftan Parking — Supabase schema
-- Run this in the Supabase SQL Editor before using the app.
--
-- Mirrors the in-app parkingSlots model (54 spots with booking fields on each row).
-- Status (free/busy/reserved) is computed in the browser from start_date/end_date.
--
-- Note: this project already had an incomplete public.bookings table (no last_name,
-- no unique spot_number). The app uses public.parking_spots instead. You may drop
-- public.bookings after migrating any data you care about.

create table if not exists public.parking_spots (
  id integer primary key check (id between 1 and 54),
  line text not null check (line in ('A', 'B', 'V', 'G', 'D')),
  order_num text not null default '',
  last_name text not null default '',
  hotel_num text not null default '',
  phone text not null default '',
  car_number text not null default '',
  car_brand text not null default '',
  notes text not null default '',
  start_date date,
  end_date date,
  updated_at timestamptz not null default now()
);

create or replace function public.set_parking_spots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists parking_spots_set_updated_at on public.parking_spots;
create trigger parking_spots_set_updated_at
  before update on public.parking_spots
  for each row execute function public.set_parking_spots_updated_at();

-- Public kiosk-style access (same trust model as the previous shared JSON blob).
alter table public.parking_spots enable row level security;

drop policy if exists "parking_spots_select_anon" on public.parking_spots;
drop policy if exists "parking_spots_insert_anon" on public.parking_spots;
drop policy if exists "parking_spots_update_anon" on public.parking_spots;
drop policy if exists "parking_spots_delete_anon" on public.parking_spots;

create policy "parking_spots_select_anon"
  on public.parking_spots for select
  to anon, authenticated
  using (true);

create policy "parking_spots_insert_anon"
  on public.parking_spots for insert
  to anon, authenticated
  with check (true);

create policy "parking_spots_update_anon"
  on public.parking_spots for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "parking_spots_delete_anon"
  on public.parking_spots for delete
  to anon, authenticated
  using (true);

-- Realtime: booking on one client updates others immediately
alter table public.parking_spots replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.parking_spots;
  exception
    when duplicate_object then null;
  end;
end $$;

-- Seed 54 spots (idempotent). Spots 1–15 default to НафтанТранс long lease.
insert into public.parking_spots (
  id, line, order_num, last_name, hotel_num, phone, car_number, car_brand, notes, start_date, end_date
)
select
  s.id,
  case
    when s.id between 1 and 15 then 'A'
    when s.id between 16 and 20 then 'B'
    when s.id between 21 and 32 then 'V'
    when s.id between 33 and 43 then 'G'
    else 'D'
  end as line,
  '' as order_num,
  case when s.id <= 15 then 'НафтанТранс' else '' end as last_name,
  '' as hotel_num,
  '' as phone,
  case when s.id <= 15 then 'ООО' else '' end as car_number,
  case when s.id <= 15 then 'Фирма' else '' end as car_brand,
  '' as notes,
  case when s.id <= 15 then date '2026-11-01' else null end as start_date,
  case when s.id <= 15 then date '2027-12-01' else null end as end_date
from generate_series(1, 54) as s(id)
on conflict (id) do nothing;
