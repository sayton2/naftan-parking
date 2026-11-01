// Выделенная стабильная база данных Google Firebase для стоянки Нафтан
const CLOUD_URL = "https://firebaseio.com";

let parkingSlots = [];
let activeSlotId = null;

// Старт системы
function initSystem() {
    generateFreshDatabase(); // Сразу выводим пустую сетку на экран
    loadFromCloud();         // Подгружаем актуальные брони из интернета
    
    // Авто-проверка обновлений каждые 4 секунды для связи админа и охраны
    setInterval(loadFromCloud, 4000);
    
    setupValidationListeners();
}

function loadFromCloud() {
    fetch(CLOUD_URL)
    .then(res => {
        if (!res.ok) throw new Error("Сбой сети");
        return res.json();
    })
    .then(data => {
        if (data && data.length > 0) {
            parkingSlots = data;
            recalculateSystem(); // Перерисовываем актуальные цвета и данные
        }
    })
    .catch(err => {
        console.log("Локальный режим работы...");
        recalculateSystem();
    });
}

function generateFreshDatabase() {
    if (parkingSlots.length > 0) return;
    
    parkingSlots = [];
    for (let i = 1; i <= 54; i++) {
        let line = 'A';
        if (i >= 16 && i <= 20) line = 'B';
        else if (i >= 21 && i <= 32) line = 'V';
        else if (i >= 33 && i <= 43) line = 'G';
        else if (i >= 44 && i <= 54) line = 'D';

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

function saveToCloudBackend() {
    // Метод PUT в Firebase сохраняет данные мгновенно и без токенов
    fetch(CLOUD_URL, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parkingSlots)
    })
    .catch(err => console.error("Ошибка сохранения в облако:", err));
}

function recalculateSystem() {
    const today = new Date();
    today.setHours(0,0,0,0);

    parkingSlots.forEach(slot => {
        if (!slot.start || !slot.end) {
            slot.status = 'free';
            return;
        }

        // Очистка от возможных старых битых данных
        if (typeof slot.start === 'string' && slot.start.includes(',')) slot.start = slot.start.split(',')[0];
        if (typeof slot.end === 'string' && slot.end.includes(',')) slot.end = slot.end.split(',')[0];

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

document.getElementById('booking-form').onsubmit = (e) => {
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
    
    saveToCloudBackend();
    recalculateSystem();
};

document.getElementById('btn-cancel-yes').onclick = () => {
    const slot = parkingSlots.find(s => s.id === activeSlotId);
    slot.orderNum = ''; slot.lastName = ''; slot.hotelNum = ''; slot.phone = '';
    slot.carNumber = ''; slot.carBrand = ''; slot.notes = ''; slot.start = ''; slot.end = '';
    document.getElementById('cancel-modal').style.display = 'none';
    
    saveToCloudBackend();
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
tr.innerHTML = <td><strong>Место ${slot.id}</strong></td><td>${slot.lastName || '—'}</td><td>${slot.carBrand || '—'}</td><td>${slot.carNumber || '—'}</td><td>${slot.phone || '—'}</td><td>с ${formatDate(slot.start)} по ${formatDate(slot.end)} (${days} дн.)</td>;
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
return ${parts[2]}.${parts[1]}.${parts[0]}; // Идеальный вывод ДД.ММ.ГГГГ
}
initSystem();





