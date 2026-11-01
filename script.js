let parkingSlots = [];
let activeSlotId = null;

function initSystem() {
    parkingSlots = [];
    
    // Генерируем Линию А: 1-15 (Нумерация снизу вверх)
    for (let i = 1; i <= 15; i++) {
        parkingSlots.push(createSlotObject(i, 'A'));
    }
    // Генерируем Линию Б: 16-20 (Горизонтально слева направо)
    for (let i = 16; i <= 20; i++) {
        parkingSlots.push(createSlotObject(i, 'B'));
    }
    // Генерируем Линию В: 21-32 (Вертикально сверху вниз)
    for (let i = 21; i <= 32; i++) {
        parkingSlots.push(createSlotObject(i, 'V'));
    }
    // Генерируем Линию Г: 33-43 (Вертикально сверху вниз)
    for (let i = 33; i <= 43; i++) {
        parkingSlots.push(createSlotObject(i, 'G'));
    }
    // Генерируем Линию Д: 44-54 (Вертикально сверху вниз)
    for (let i = 44; i <= 54; i++) {
        parkingSlots.push(createSlotObject(i, 'D'));
    }

    recalculateSystem();
    setupValidationListeners();
}

function createSlotObject(i, line) {
    let slot = {
        id: i, line: line, orderNum: '', lastName: '',
        hotelNum: '', phone: '', carNumber: '', carBrand: '',
        notes: '', start: '', end: '', status: 'free'
    };
    // Места 1-15 арендованы фирмой НафтанТранс
    if (i <= 15) {
        slot.lastName = 'НафтанТранс';
        slot.carBrand = 'Фирма';
        slot.carNumber = 'ООО';
        slot.start = '2026-11-01';
        slot.end = '2027-12-01';
    }
    return slot;
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
            slot.status = 'reserved'; // Забронировано на будущее (Желтый)
        } else {
            slot.status = 'free'; // Свободно / Срок истек (Зеленый)
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
    Object.values(containers).forEach(c => c.innerHTML = '');

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
            containers['A'].insertBefore(card, containers['A'].firstChild);
        } else {
            containers[slot.line].appendChild(card);
        }
    });
}
function handleSlotClick(id) {
    const slot = parkingSlots.find(s => s.id === id);
    activeSlotId = id;

    if (slot.status === 'free') {
        openBookingFormDirect(slot);
    } else {
        document.getElementById('cancel-modal-text').innerText = `Вы действительно хотите отменить бронирование для места №${slot.id} (${slot.lastName || slot.orderNum})? Все данные будут удалены.`;
        document.getElementById('cancel-modal').style.display = 'block';
    }
}

function openBookingFormDirect(slot) {
    document.getElementById('modal-slot-info').innerText = `Место ${slot.id}, линия ${getLineName(slot.line)}. Заполните недостающие поля карточки гостя.`;
    
    document.getElementById('input-orderNum').value = slot.orderNum;
    document.getElementById('input-lastName').value = slot.lastName;
    document.getElementById('input-hotelNum').value = slot.hotelNum;
    document.getElementById('input-phone').value = slot.phone;
    document.getElementById('input-carNumber').value = slot.carNumber;
    document.getElementById('input-carBrand').value = slot.carBrand;
    document.getElementById('input-notes').value = slot.notes;
    document.getElementById('input-start').value = slot.start;
    document.getElementById('input-end').value = slot.end;
    
    validateForm();
    document.getElementById('booking-modal').style.display = 'block';
}

function setupValidationListeners() {
    const inputs = ['input-orderNum', 'input-lastName', 'input-hotelNum', 'input-start', 'input-end'];
    inputs.forEach(id => {
        document.getElementById(id).addEventListener('input', validateForm);
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

    document.getElementById('btn-submit-booking').disabled = !(hasDates && hasOneRequiredField);
}

function renderIncompleteAlerts() {
    const container = document.getElementById('incomplete-slots-list');
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
    document.getElementById('alert-badge-count').innerText = `карточек: ${count}`;
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
    recalculateSystem();
};

document.getElementById('btn-cancel-yes').onclick = () => {
    const slot = parkingSlots.find(s => s.id === activeSlotId);
    slot.orderNum = ''; slot.lastName = ''; slot.hotelNum = ''; slot.phone = '';
    slot.carNumber = ''; slot.carBrand = ''; slot.notes = ''; slot.start = ''; slot.end = '';
    document.getElementById('cancel-modal').style.display = 'none';
    recalculateSystem();
};

document.getElementById('btn-cancel-no').onclick = () => {
    document.getElementById('cancel-modal').style.display = 'none';
};

document.getElementById('close-booking').onclick = () => document.getElementById('booking-modal').style.display = 'none';
document.getElementById('btn-booking-cancel').onclick = () => document.getElementById('booking-modal').style.display = 'none';

function renderAbonnements() {
    const tbody = document.getElementById('abonnements-table-body');
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
    document.getElementById('free-count').innerText = f; document.getElementById('busy-count').innerText = b; document.getElementById('reserved-count').innerText = r;
}

function getLineName(l) { return l === 'B'?'Б':l === 'V'?'В':l === 'G'?'Г':'Д'; }
function formatDate(dateStr) {
    if (!dateStr) return '';
    // Преобразуем формат ГГГГ-ММ-ДД в ДД.ММ.ГГГГ
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}


document.getElementById('nav-places').onclick = (e) => { e.preventDefault(); switchTab('places'); };
document.getElementById('nav-abonnements').onclick = (e) => { e.preventDefault(); switchTab('abonnements'); };
function switchTab(t) {
    document.getElementById('nav-places').className = t==='places'?'active':'';
    document.getElementById('nav-abonnements').className = t==='abonnements'?'active':'';
    document.getElementById('section-places-content').style.display = t==='places'?'block':'none';
    document.getElementById('section-abonnements-content').style.display = t==='abonnements'?'block':'none';
}

initSystem();
