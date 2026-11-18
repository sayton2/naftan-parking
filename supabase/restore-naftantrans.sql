-- Naftan Parking — restore НафтанТранс organization leases (spots 1–15)
-- Paste into Supabase SQL Editor and run.
--
-- Matches original pre-Supabase buildInitialGrid defaults:
--   last_name = 'НафтанТранс', car_brand = 'Фирма', car_number = 'ООО'
--   start_date = 2026-11-01, end_date = 2027-12-01, line = 'A'
--
-- Live DB was seeded with 54 empty rows (schema.sql uses ON CONFLICT DO NOTHING),
-- so the НафтанТранс defaults never landed. This UPDATE only fills still-empty
-- spots 1–15 and does not overwrite real guest bookings.

update public.parking_spots
set
  line = 'A',
  last_name = 'НафтанТранс',
  car_brand = 'Фирма',
  car_number = 'ООО',
  start_date = date '2026-11-01',
  end_date = date '2027-12-01'
where id between 1 and 15
  and coalesce(last_name, '') = ''
  and coalesce(order_num, '') = ''
  and coalesce(hotel_num, '') = ''
  and start_date is null
  and end_date is null;

-- Verify: expect 15 rows with НафтанТранс
select id, line, last_name, car_brand, car_number, start_date, end_date
from public.parking_spots
where id between 1 and 15
order by id;
