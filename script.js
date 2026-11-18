import { supabase } from './supabaseClient.js';

const TABLE = 'parking_spots';

let parkingSlots = [];
let activeSlotId = null;
let realtimeChannel = null;

// Старт системы
function initSystem() {
    buildInitialGrid();  // Сразу рисуем 54 места, чтобы экран не был белым
    loadDataFromCloud(); // Подгружаем актуальные брони из Supabase
    subscribeToRealtime();
    setupValidationListeners();
}

function lineForId(i) {
    if (i >= 16 && i <= 20) return 'B';
    if (i >= 21 && i <= 32) return 'V';
    if (i >= 33 && i <= 43) return 'G';
    if (i >= 44 && i <= 54) return 'D';
    return 'A';
}

function rowToSlot(row) {
    return {
        id: row.id,
        line: row.line,
        orderNum: row.order_num || '',
        lastName: row.last_name || '',
        hotelNum: row.hotel_num || '',
        phone: row.phone || '',
        carNumber: row.car_number || '',
        carBrand: row.car_brand || '',
        notes: row.notes || '',
        start: row.start_date || '',
        end: row.end_date || '',
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
        .sort((a, b) => a.id - b.id);
    recalculateSystem();
}

// Загрузка данных из Supabase
async function loadDataFromCloud() {
    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            // Таблица пуста — отправляем стартовую сетку (после запуска schema.sql обычно уже есть 54 строки)
            await sendDataToCloud();
            return;
        }

        applySlotsFromRows(data);
    } catch (err) {
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
        if (i <= 15) {
            slot.lastName = 'НафтанТранс';
            slot.carBrand = 'Фирма';
            slot.carNumber = 'ООО';
            slot.start = '2026-11-01';
            slot.end = '2027-12-01';
        }
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

        if (slot.line === 'A') {
            if(containers['A']) containers['A'].insertBefore(card, containers['A'].firstChild);
        } else {
            if(containers[slot.line]) containers[slot.line].appendChild(card);
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
    document.getElementById('input-start').value = slot.start || '';
    document.getElementById('input-end').value = slot.end || '';
    
    validateForm();
    document.getElementById('booking-modal').style.display = 'block';
}

function setupValidationListeners() {
    const inputs = ['input-orderNum', 'input-lastName', 'input-hotelNum', 'input-start', 'input-end'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', validateForm);
    });
}

function validateForm() {
    const orderNum = document.getElementById('input-orderNum').value.trim();
    const lastName = document.getElementById('input-lastName').value.trim();
    const hotelNum = document.getElementById('input-hotelNum').value.trim();
    const start = document.getElementById('input-start').value;
    const end = document.getElementById('input-end').value;

    const hasDates = start !== '' && end !== '';
    const hasOneRequiredField = orderNum !== '' || lastName !== '' || hotelNum !== '';

    const btn = document.getElementById('btn-submit-booking');
    if(btn) btn.disabled = !(hasDates && hasOneRequiredField);
}

function renderIncompleteAlerts() {
    const container = document.getElementById('incomplete-slots-list');
    if (!container) return;
    container.innerHTML = '';
    let count = 0;

    let sortedAlerts = [...parkingSlots].sort((a,b) => a.id - b.id);

    sortedAlerts.forEach(slot => {
        if (slot.id <= 15) return; 

        if (slot.start || slot.end) {
            const isFull = slot.orderNum && slot.lastName && slot.hotelNum && slot.phone && slot.carNumber && slot.carBrand && slot.start && slot.end;
            
            if (!isFull) {
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
            }
        }
    });
    const badge = document.getElementById('alert-badge-count');
    if(badge) badge.innerText = `карточек: ${count}`;
}

// Привязка отправки формы к функции обновления облака
document.getElementById('booking-form').onsubmit = async (e) => {
    e.preventDefault();
    const slot = parkingSlots.find(s => s.id === activeSlotId);

    slot.orderNum = document.getElementById('input-orderNum').value.trim();
    slot.lastName = document.getElementById('input-lastName').value.trim();
    slot.hotelNum = document.getElementById('input-hotelNum').value.trim();
    slot.phone = document.getElementById('input-phone').value.trim();
    slot.carNumber = document.getElementById('input-carNumber').value.trim();
    slot.carBrand = document.getElementById('input-carBrand').value.trim();
    slot.notes = document.getElementById('input-notes').value.trim();
    slot.start = document.getElementById('input-start').value;
    slot.end = document.getElementById('input-end').value;

    document.getElementById('booking-modal').style.display = 'none';
    
    await updateSpotInCloud(slot);
    recalculateSystem();
};

// Привязка отмены брони
document.getElementById('btn-cancel-yes').onclick = async () => {
    const slot = parkingSlots.find(s => s.id === activeSlotId);
    slot.orderNum = ''; slot.lastName = ''; slot.hotelNum = ''; slot.phone = '';
    slot.carNumber = ''; slot.carBrand = ''; slot.notes = ''; slot.start = ''; slot.end = '';
    document.getElementById('cancel-modal').style.display = 'none';
    
    await updateSpotInCloud(slot);
    recalculateSystem();
};

document.getElementById('btn-cancel-no').onclick = () => {
    document.getElementById('cancel-modal').style.display = 'none';
};

document.getElementById('close-booking').onclick = () => document.getElementById('booking-modal').style.display = 'none';
document.getElementById('btn-booking-cancel').onclick = () => document.getElementById('booking-modal').style.display = 'none';

function renderAbonnements() {
    const tbody = document.getElementById('abonnements-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let sortedAbonnements = [...parkingSlots].sort((a,b) => a.id - b.id);

    sortedAbonnements.forEach(slot => {
        if (slot.start && slot.end) {
            const days = Math.ceil(Math.abs(new Date(slot.end) - new Date(slot.start)) / (1000 * 60 * 60 * 24));
            if (days > 10) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td><strong>Место ${slot.id}</strong></td><td>${slot.lastName || '—'}</td><td>${slot.carBrand || '—'}</td><td>${slot.carNumber || '—'}</td><td>${slot.phone || '—'}</td><td>с ${formatDate(slot.start)} по ${formatDate(slot.end)} (${days} дн.)</td>`;
                tbody.appendChild(tr);
            }
        }
    });
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

function getLineName(l) { return l === 'B'?'Б':l === 'V'?'В':l === 'G'?'Г':'Д'; }
function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts}.${parts}.${parts}`;
}

initSystem();
