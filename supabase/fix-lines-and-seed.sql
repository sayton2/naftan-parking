-- Naftan Parking — immediate DB fix (paste into Supabase SQL Editor)
--
-- Use when the map is empty or lines were stored as Cyrillic А/Б/В/Г/Д
-- instead of Latin A/B/V/G/D. Safe to re-run.
--
-- Live table may have been created without the CHECKs from schema.sql;
-- this script normalizes data, removes stray rows, and re-applies constraints.

-- 1) Drop rows outside the 1–54 map
delete from public.parking_spots
where id < 1 or id > 54;

-- 2) Normalize Cyrillic line letters → Latin (look-alike glyphs)
update public.parking_spots set line = 'A' where line in ('A', 'А', 'a', 'а');
update public.parking_spots set line = 'B' where line in ('B', 'Б', 'b', 'б');
update public.parking_spots set line = 'V' where line in ('V', 'В', 'v', 'в');
update public.parking_spots set line = 'G' where line in ('G', 'Г', 'g', 'г');
update public.parking_spots set line = 'D' where line in ('D', 'Д', 'd', 'д');

-- 3) Force correct line from spot id (repairs any other junk values)
update public.parking_spots
set line = case
  when id between 1 and 15 then 'A'
  when id between 16 and 20 then 'B'
  when id between 21 and 32 then 'V'
  when id between 33 and 43 then 'G'
  else 'D'
end;

-- 4) Ensure all 54 spots exist (idempotent). Spots 1–15 = НафтанТранс defaults
--    only when the row is still empty (does not overwrite real bookings).
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
  end,
  '',
  case when s.id <= 15 then 'НафтанТранс' else '' end,
  '',
  '',
  case when s.id <= 15 then 'ООО' else '' end,
  case when s.id <= 15 then 'Фирма' else '' end,
  '',
  case when s.id <= 15 then date '2026-11-01' else null end,
  case when s.id <= 15 then date '2027-12-01' else null end
from generate_series(1, 54) as s(id)
on conflict (id) do update set
  line = excluded.line,
  last_name = case
    when public.parking_spots.last_name = ''
      and public.parking_spots.start_date is null
      and excluded.last_name <> ''
    then excluded.last_name
    else public.parking_spots.last_name
  end,
  car_number = case
    when public.parking_spots.car_number = ''
      and public.parking_spots.start_date is null
      and excluded.car_number <> ''
    then excluded.car_number
    else public.parking_spots.car_number
  end,
  car_brand = case
    when public.parking_spots.car_brand = ''
      and public.parking_spots.start_date is null
      and excluded.car_brand <> ''
    then excluded.car_brand
    else public.parking_spots.car_brand
  end,
  start_date = case
    when public.parking_spots.start_date is null
      and public.parking_spots.last_name = ''
      and excluded.start_date is not null
    then excluded.start_date
    else public.parking_spots.start_date
  end,
  end_date = case
    when public.parking_spots.end_date is null
      and public.parking_spots.last_name = ''
      and excluded.end_date is not null
    then excluded.end_date
    else public.parking_spots.end_date
  end;

-- 5) Re-apply CHECKs (drop old unconstrained / wrong constraints first)
alter table public.parking_spots drop constraint if exists parking_spots_id_check;
alter table public.parking_spots drop constraint if exists parking_spots_line_check;
alter table public.parking_spots
  add constraint parking_spots_id_check check (id between 1 and 54);
alter table public.parking_spots
  add constraint parking_spots_line_check check (line in ('A', 'B', 'V', 'G', 'D'));

-- 6) Ensure anon RLS (no-op if already present)
alter table public.parking_spots enable row level security;

drop policy if exists "parking_spots_select_anon" on public.parking_spots;
drop policy if exists "parking_spots_insert_anon" on public.parking_spots;
drop policy if exists "parking_spots_update_anon" on public.parking_spots;
drop policy if exists "parking_spots_delete_anon" on public.parking_spots;

create policy "parking_spots_select_anon"
  on public.parking_spots for select to anon, authenticated using (true);
create policy "parking_spots_insert_anon"
  on public.parking_spots for insert to anon, authenticated with check (true);
create policy "parking_spots_update_anon"
  on public.parking_spots for update to anon, authenticated using (true) with check (true);
create policy "parking_spots_delete_anon"
  on public.parking_spots for delete to anon, authenticated using (true);

-- Quick verify
select line, count(*) from public.parking_spots group by line order by line;
select count(*) as total from public.parking_spots;
