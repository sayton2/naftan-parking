import { supabase } from './supabaseClient.js';

const TABLE = 'parking_spots';

let parkingSlots = [];
let activeSlotId = null;
let realtimeChannel = null;
let cloudLoadId = 0;

// Старт системы
function initSystem() {
    buildInitialGrid();  // Сразу рисуем 54 места, чтобы экран не был белым
    loadDataFromCloud(); // Подгружаем актуальные брони из Supabase
    subscribeToRealtime();
    setupDatePickers();
    setupValidationListeners();
}

function bookingDateOptions() {
    return {
        disableMobile: true,
        locale: "ru",
        dateFormat: "Y-m-d",
        allowInput: false,
        appendTo: document.body,
        onChange() { validateForm(); }
    };
}

function setupDatePickers() {
    const createPicker = globalThis.flatpickr;
    if (typeof createPicker !== "function") {
        console.error("Flatpickr не загружен");
        ["input-start", "input-end"].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.readOnly = false;
        });
        return;
    }
    ["input-start", "input-end"].forEach(id => {
        const input = document.getElementById(id);
        if (!input || input._flatpickr) return;
        createPicker(input, bookingDateOptions());
    });
}

function setPickerDate(id, value) {
    const input = document.getElementById(id);
    if (!input) return;
    const iso = normalizeDate(value);
    const picker = input._flatpickr;
    if (!picker) {
        input.value = iso;
        return;
    }
    if (!iso) picker.clear(false);
    else picker.setDate(iso, false, "Y-m-d");
}

function readPickerDate(id) {
    const input = document.getElementById(id);
    if (!input) return "";
    const picker = input._flatpickr;
    if (picker?.selectedDates?.length) {
        return picker.formatDate(picker.selectedDates[0], "Y-m-d");
    }
    return normalizeDate(input.value);
}

function closeDatePickers() {
    ["input-start", "input-end"].forEach(id => {
        document.getElementById(id)?._flatpickr?.close();
    });
}

function lineForId(i) {
    if (i >= 16 && i <= 20) return 'B';
    if (i >= 21 && i <= 32) return 'V';
    if (i >= 33 && i <= 43) return 'G';
    if (i >= 44 && i <= 54) return 'D';
    return 'A';
}

// Постоянная аренда линии А (места 1–15) до миграции на Supabase.
const NAFTAN_TRANS = {
    lastName: 'НафтанТранс',
    carBrand: 'Фирма',
    carNumber: 'ООО',
    start: '2026-11-01',
    end: '2027-12-01'
};

function applyNaftanTransDefaults(slot) {
    slot.lastName = NAFTAN_TRANS.lastName;
    slot.carBrand = NAFTAN_TRANS.carBrand;
    slot.carNumber = NAFTAN_TRANS.carNumber;
    slot.start = NAFTAN_TRANS.start;
    slot.end = NAFTAN_TRANS.end;
}

function isUntouchedSpot(slot) {
    return !slot.start && !slot.end && !slot.lastName && !slot.orderNum
        && !slot.hotelNum && !slot.phone && !slot.carNumber && !slot.carBrand && !slot.notes;
}

// <input type="date"> принимает только ГГГГ-ММ-ДД. Из Supabase иногда приходит ISO-строка.
function normalizeDate(value) {
    if (value == null || value === '') return '';
    const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
}

// Map accepts Latin A/B/V/G/D or Cyrillic А/Б/В/Г/Д (visually identical in UI labels).
const LINE_NORMALIZE = {
    A: 'A', B: 'B', V: 'V', G: 'G', D: 'D',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D'
};

function normalizeLine(line, id) {
    const key = (line ?? '').toString().trim();
    if (LINE_NORMALIZE[key]) return LINE_NORMALIZE[key];
    // Fall back to id→line so a bad/missing DB value still places the card.
    if (id >= 1 && id <= 54) return lineForId(id);
    return 'A';
}

function rowToSlot(row) {
    const id = Number(row.id);
    return {
        id,
        line: normalizeLine(row.line, id),
        orderNum: row.order_num || '',
        lastName: row.last_name || '',
        hotelNum: row.hotel_num || '',
        phone: row.phone || '',
        carNumber: row.car_number || '',
        carBrand: row.car_brand || '',
        notes: row.notes || '',
        start: normalizeDate(row.start_date),
        end: normalizeDate(row.end_date),
        status: 'free'
    };
}

function slotToRow(slot) {
    return {
        id: slot.id,
        line: slot.line,
        order_num: slot.orderNum || '',
        last_name: slot.lastName || '',
        hotel_num: slot.hotelNum || '',
        phone: slot.phone || '',
        car_number: slot.carNumber || '',
        car_brand: slot.carBrand || '',
        notes: slot.notes || '',
        start_date: slot.start || null,
        end_date: slot.end || null
    };
}

function applySlotsFromRows(rows) {
    parkingSlots = rows
        .map(rowToSlot)
        .filter(slot => Number.isFinite(slot.id) && slot.id >= 1 && slot.id <= 54)
        .sort((a, b) => a.id - b.id);
    return restoreEmptyNaftanTrans();
}

// Пустые места 1–15 (сид с on conflict do nothing их не заполнил) возвращаем к аренде НафтанТранс.
function restoreEmptyNaftanTrans() {
    const restored = [];
    parkingSlots.forEach(slot => {
        if (slot.id >= 1 && slot.id <= 15 && isUntouchedSpot(slot)) {
            applyNaftanTransDefaults(slot);
            restored.push(slot);
        }
    });
    return restored;
}

// Загрузка данных из Supabase
async function loadDataFromCloud() {
    const loadId = ++cloudLoadId;
    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .order('id', { ascending: true });

        if (loadId !== cloudLoadId) return;
        if (error) throw error;

        if (!data || data.length === 0) {
            // Таблица пуста — отправляем стартовую сетку (после запуска schema.sql обычно уже есть 54 строки)
            await sendDataToCloud();
            if (loadId !== cloudLoadId) return;
            // Keep the local 54-spot grid already built by buildInitialGrid.
            recalculateSystem();
            return;
        }

        const restored = applySlotsFromRows(data);
        recalculateSystem();
        if (restored.length) {
            const { error: restoreError } = await supabase
                .from(TABLE)
                .upsert(restored.map(slotToRow), { onConflict: 'id' });
            if (loadId !== cloudLoadId) return;
            if (restoreError) console.error('Ошибка восстановления НафтанТранс:', restoreError);
        }
    } catch (err) {
        if (loadId !== cloudLoadId) return;
        console.log('Автономный режим работы...', err?.message || err);
        recalculateSystem();
    }
}

function subscribeToRealtime() {
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }

    realtimeChannel = supabase
        .channel('parking-spots-realtime')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: TABLE },
            () => {
                loadDataFromCloud();
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Realtime: подключено к parking_spots');
            }
        });
}

// Сборка 54 мест при первом запуске
function buildInitialGrid() {
    if (parkingSlots.length > 0) return;
    parkingSlots = [];
    for (let i = 1; i <= 54; i++) {
        let line = lineForId(i);

        let slot = {
            id: i, line: line, orderNum: '', lastName: '',
            hotelNum: '', phone: '', carNumber: '', carBrand: '',
            notes: '', start: '', end: '', status: 'free'
        };
        // НафтанТранс по умолчанию
        if (i <= 15) applyNaftanTransDefaults(slot);
        parkingSlots.push(slot);
    }
    recalculateSystem();
}

// Сохранение всех мест (seed / полный sync)
async function sendDataToCloud() {
    try {
        const rows = parkingSlots.map(slotToRow);
        const { error } = await supabase
            .from(TABLE)
            .upsert(rows, { onConflict: 'id' });
        if (error) throw error;
    } catch (err) {
        console.error('Ошибка сохранения в Supabase:', err);
    }
}

// Обновление одного места (бронь / отмена)
async function updateSpotInCloud(slot) {
    try {
        const { error } = await supabase
            .from(TABLE)
            .upsert(slotToRow(slot), { onConflict: 'id' });
        if (error) throw error;
    } catch (err) {
        console.error('Ошибка обновления места в Supabase:', err);
    }
}

function recalculateSystem() {
    const today = new Date();
    today.setHours(0,0,0,0);

    parkingSlots.forEach(slot => {
        if (!slot.start || !slot.end) {
            slot.status = 'free';
            return;
        }

        const sDate = new Date(slot.start);
        const eDate = new Date(slot.end);
        sDate.setHours(0,0,0,0);
        eDate.setHours(0,0,0,0);
        
        if (sDate <= today && eDate >= today) {
            slot.status = 'busy'; // Занято (Красный)
        } else if (sDate > today) {
            slot.status = 'reserved'; // Забронировано (Желтый)
        } else {
            slot.status = 'free'; // Свободно (Зеленый)
        }
    });

    renderLayout();
    renderAbonnements();
    renderIncompleteAlerts();
    updateCounters();
}

function renderLayout() {
    const containers = {
        'A': document.getElementById('slots-a'), 'B': document.getElementById('slots-b'),
        'V': document.getElementById('slots-v'), 'G': document.getElementById('slots-g'),
        'D': document.getElementById('slots-d')
    };
    Object.values(containers).forEach(c => { if(c) c.innerHTML = ''; });

    parkingSlots.forEach(slot => {
        const card = document.createElement('div');
        card.className = `slot-card status-${slot.status}`;
        
        let label = `${slot.id.toString().padStart(2, '0')} `;
        if (slot.status === 'free') {
            label += `свободно<br><span class="dates">готово к заезду</span>`;
        } else {
            label += `<span class="name">${slot.lastName || slot.orderNum || 'Занято'}</span><br><span class="dates">с ${formatDate(slot.start)} по ${formatDate(slot.end)}</span>`;
        }
        
        card.innerHTML = label;
        card.onclick = () => handleSlotClick(slot.id);

        const line = normalizeLine(slot.line, slot.id);
        slot.line = line;
        if (line === 'A') {
            if(containers['A']) containers['A'].insertBefore(card, containers['A'].firstChild);
        } else if (containers[line]) {
            containers[line].appendChild(card);
        }
    });
}
function handleSlotClick(id) {
    const slot = parkingSlots.find(s => s.id === id);
    activeSlotId = id;

    if (slot.status === 'free') {
        openBookingFormDirect(slot);
    } else {
        document.getElementById('cancel-modal-text').innerText = `Вы действительно хотите отменить бронирование для места №${slot.id} (${slot.lastName || slot.orderNum})? Все данные будут удалены со всех устройств.`;
        document.getElementById('cancel-modal').style.display = 'block';
    }
}

function openBookingFormDirect(slot) {
    document.getElementById('modal-slot-info').innerText = `Место ${slot.id}, линия ${getLineName(slot.line)}. Заполните поля карточки гостя.`;
    
    document.getElementById('input-orderNum').value = slot.orderNum || '';
    document.getElementById('input-lastName').value = slot.lastName || '';
    document.getElementById('input-hotelNum').value = slot.hotelNum || '';
    document.getElementById('input-phone').value = slot.phone || '';
    document.getElementById('input-carNumber').value = slot.carNumber || '';
    document.getElementById('input-carBrand').value = slot.carBrand || '';
    document.getElementById('input-notes').value = slot.notes || '';
    setPickerDate('input-start', slot.start);
    setPickerDate('input-end', slot.end);
    
    validateForm();
    document.getElementById('booking-modal').style.display = 'block';
}

function setupValidationListeners() {
    // Кнопка в HTML disabled, пока нет обеих дат и одного из полей: заказ / фамилия / отель.
    const form = document.getElementById('booking-form');
    if (!form) return;
    form.addEventListener('input', validateForm);
    form.addEventListener('change', validateForm);
}

function validateForm() {
    const orderNum = document.getElementById('input-orderNum')?.value.trim() || '';
    const lastName = document.getElementById('input-lastName')?.value.trim() || '';
    const hotelNum = document.getElementById('input-hotelNum')?.value.trim() || '';
    const start = readPickerDate('input-start');
    const end = readPickerDate('input-end');

    const hasDates = start !== '' && end !== '';
    const hasOneRequiredField = orderNum !== '' || lastName !== '' || hotelNum !== '';

    const btn = document.getElementById('btn-submit-booking');
    if (btn) btn.disabled = !(hasDates && hasOneRequiredField);
}

function fieldText(value) {
    return String(value ?? '').trim();
}

// Полная карточка: все поля формы, кроме примечаний. Пустые пробелы не считаются заполненными.
function isSlotCardComplete(slot) {
    return Boolean(
        fieldText(slot.orderNum) &&
        fieldText(slot.lastName) &&
        fieldText(slot.hotelNum) &&
        fieldText(slot.phone) &&
        fieldText(slot.carNumber) &&
        fieldText(slot.carBrand) &&
        normalizeDate(slot.start) &&
        normalizeDate(slot.end)
    );
}

function isIncompleteAlert(slot) {
    if (!slot || slot.id <= 15) return false;
    const hasBooking = Boolean(normalizeDate(slot.start) || normalizeDate(slot.end));
    return hasBooking && !isSlotCardComplete(slot);
}

function renderIncompleteAlerts() {
    const container = document.getElementById('incomplete-slots-list');
    if (!container) return;
    container.innerHTML = '';
    let count = 0;

    [...parkingSlots].sort((a, b) => a.id - b.id).forEach(slot => {
        if (!isIncompleteAlert(slot)) return;

        count++;
        const card = document.createElement('div');
        card.className = 'alert-card';
        card.innerHTML = `
            <div>
                <span class="place-name">Место ${slot.id} · Линия ${getLineName(slot.line)} · Бронь</span>
                <br><span class="reason">Карточка заполнена не полностью (есть пустые поля)</span>
            </div>
            <div class="dates" style="text-align:right;">${formatDate(slot.start)} — ${formatDate(slot.end)}</div>
        `;
        card.onclick = () => {
            activeSlotId = slot.id;
            openBookingFormDirect(slot);
        };
        container.appendChild(card);
    });
    const badge = document.getElementById('alert-badge-count');
    if (badge) badge.innerText = `карточек: ${count}`;
}

// Привязка отправки формы к функции обновления облака
document.getElementById('booking-form').onsubmit = async (e) => {
    e.preventDefault();
    const slot = parkingSlots.find(s => s.id === activeSlotId);
    if (!slot) return;

    slot.orderNum = document.getElementById('input-orderNum').value.trim();
    slot.lastName = document.getElementById('input-lastName').value.trim();
    slot.hotelNum = document.getElementById('input-hotelNum').value.trim();
    slot.phone = document.getElementById('input-phone').value.trim();
    slot.carNumber = document.getElementById('input-carNumber').value.trim();
    slot.carBrand = document.getElementById('input-carBrand').value.trim();
    slot.notes = document.getElementById('input-notes').value.trim();
    slot.start = readPickerDate('input-start');
    slot.end = readPickerDate('input-end');

    closeDatePickers();
    document.getElementById('booking-modal').style.display = 'none';

    // Сразу убрать полную карточку из нижнего списка, не дожидаясь ответа Supabase.
    // Старый ответ загрузки не должен вернуть её обратно.
    cloudLoadId++;
    recalculateSystem();
    await updateSpotInCloud(slot);
};

// Привязка отмены брони
document.getElementById('btn-cancel-yes').onclick = async () => {
    const slot = parkingSlots.find(s => s.id === activeSlotId);
    slot.orderNum = ''; slot.lastName = ''; slot.hotelNum = ''; slot.phone = '';
    slot.carNumber = ''; slot.carBrand = ''; slot.notes = ''; slot.start = ''; slot.end = '';
    document.getElementById('cancel-modal').style.display = 'none';

    cloudLoadId++;
    recalculateSystem();
    await updateSpotInCloud(slot);
};

document.getElementById('btn-cancel-no').onclick = () => {
    document.getElementById('cancel-modal').style.display = 'none';
};

document.getElementById('close-booking').onclick = () => {
    closeDatePickers();
    document.getElementById('booking-modal').style.display = 'none';
};
document.getElementById('btn-booking-cancel').onclick = () => {
    closeDatePickers();
    document.getElementById('booking-modal').style.display = 'none';
};

function parkingDays(start, end) {
    const startDate = normalizeDate(start);
    const endDate = normalizeDate(end);
    if (!startDate || !endDate) return 0;
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const utcStart = Date.UTC(startYear, startMonth - 1, startDay);
    const utcEnd = Date.UTC(endYear, endMonth - 1, endDay);
    return Math.round((utcEnd - utcStart) / 86400000);
}

function formatDuration(days) {
    const months = Math.floor(days / 30);
    const rest = days % 30;
    if (months <= 0) return `${days} дн.`;
    if (rest === 0) return `${months} мес. (${days} дн.)`;
    return `${months} мес. ${rest} дн. (${days} дн.)`;
}

function renderAbonnements() {
    const tbody = document.getElementById('abonnements-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rows = parkingSlots
        .filter(slot => slot.status === 'busy' || slot.status === 'reserved')
        .map(slot => ({ slot, days: parkingDays(slot.start, slot.end) }))
        .filter(row => row.days >= 30)
        .sort((a, b) => a.days - b.days || a.slot.id - b.slot.id);

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5">Нет занятых мест со сроком от 30 дней</td></tr>';
        return;
    }

    rows.forEach(({ slot, days }) => {
        const car = [fieldText(slot.carBrand), fieldText(slot.carNumber)].filter(Boolean).join(', ') || '—';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>Место ${slot.id}</strong></td><td>${fieldText(slot.lastName) || '—'}</td><td>${car}</td><td>${fieldText(slot.phone) || '—'}</td><td>${formatDuration(days)}</td>`;
        tbody.appendChild(tr);
    });
}

document.getElementById('nav-places').onclick = (e) => { e.preventDefault(); switchTab('places'); };
document.getElementById('nav-abonnements').onclick = (e) => { e.preventDefault(); switchTab('abonnements'); };

function switchTab(tab) {
    const showPlaces = tab === 'places';
    document.getElementById('nav-places').classList.toggle('active', showPlaces);
    document.getElementById('nav-abonnements').classList.toggle('active', !showPlaces);
    document.getElementById('section-places-content').style.display = showPlaces ? 'block' : 'none';
    document.getElementById('section-abonnements-content').style.display = showPlaces ? 'none' : 'block';
    if (!showPlaces) renderAbonnements();
}

function updateCounters() {
    let f = 0, b = 0, r = 0;
    parkingSlots.forEach(s => { if(s.status === 'free') f++; if(s.status === 'busy') b++; if(s.status === 'reserved') r++; });
    
    const elF = document.getElementById('free-count');
    const elB = document.getElementById('busy-count');
    const elR = document.getElementById('reserved-count');
    
    if(elF) elF.innerText = f; 
    if(elB) elB.innerText = b; 
    if(elR) elR.innerText = r;
}

function getLineName(l) {
    const line = normalizeLine(l);
    if (line === 'A') return 'А';
    if (line === 'B') return 'Б';
    if (line === 'V') return 'В';
    if (line === 'G') return 'Г';
    return 'Д';
}
function formatDate(dateStr) {
    const normalized = normalizeDate(dateStr);
    if (!normalized) return '';
    const parts = normalized.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

initSystem();
