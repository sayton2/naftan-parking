-- Постоянные места «НафтанТранс» (линия А, места 1–15).
-- Значения из buildInitialGrid до миграции на Supabase
-- (коммиты d69440e / 755a51d): фамилия НафтанТранс, марка «Фирма»,
-- номер «ООО», заезд 2026-11-01, выезд 2027-12-01.
--
-- Запрос перезаписывает эти 15 строк. Гостевые брони на местах 1–15
-- будут заменены арендой организации. Можно запускать повторно.

insert into public.parking_spots (
  id, line, order_num, last_name, hotel_num, phone, car_number, car_brand, notes, start_date, end_date
)
select
  s.id,
  'A',
  '',
  'НафтанТранс',
  '',
  '',
  'ООО',
  'Фирма',
  '',
  date '2026-11-01',
  date '2027-12-01'
from generate_series(1, 15) as s(id)
on conflict (id) do update set
  line = excluded.line,
  order_num = excluded.order_num,
  last_name = excluded.last_name,
  hotel_num = excluded.hotel_num,
  phone = excluded.phone,
  car_number = excluded.car_number,
  car_brand = excluded.car_brand,
  notes = excluded.notes,
  start_date = excluded.start_date,
  end_date = excluded.end_date;

-- Ожидается 15 строк.
select id, line, last_name, car_brand, car_number, start_date, end_date
from public.parking_spots
where id between 1 and 15
order by id;
