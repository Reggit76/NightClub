// Complete events.js with booking functionality
// Global variables for events data
window.eventsData = [];
window.categoriesData = [];
window.zonesData = [];

// Booking selection state
let selectedZoneId = null;
let selectedSeatId = null;
let selectedZonePrice = 0;
let selectedZoneName = '';

// Define critical booking functions first to avoid ReferenceError
window.selectZoneForBooking = async function(zoneId, eventId, zoneName, zonePrice) {
    try {
        console.log('Selecting zone:', zoneId, zoneName, zonePrice);
        
        // Update selection
        selectedZoneId = zoneId;
        selectedZonePrice = zonePrice;
        selectedZoneName = zoneName;
        selectedSeatId = null; // Reset seat selection
        
        // Update UI
        $('.zone-card').removeClass('selected');
        $(`.zone-card[data-zone-id="${zoneId}"]`).addClass('selected');
        
        // Update booking summary
        $('#selectedZoneInfo').text(zoneName);
        $('#selectedSeatInfo').text('Не выбрано');
        $('#selectedPriceInfo').text(formatPrice(zonePrice));
        $('#confirmBookingBtn').prop('disabled', true);
        
        // Show seat selection card
        $('#seatSelectionCard').removeClass('d-none');
        
        // Load seats for this zone
        await window.loadSeatsForZone(eventId, zoneId);
        
    } catch (error) {
        console.error('Error selecting zone:', error);
        showError('Ошибка выбора зоны');
    }
};

window.loadSeatsForZone = async function(eventId, zoneId) {
    try {
        console.log('Loading seats for zone:', zoneId);
        
        // Show loading in seat selection
        $('#seatSelection').html(`
            <div class="text-center py-3">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Загрузка мест...</span>
                </div>
                <p class="mt-2 text-muted">Загрузка доступных мест...</p>
            </div>
        `);
        
        // Get seats for this zone and event
        const response = await apiRequest(`/events/${eventId}/seats?zone_id=${zoneId}`);
        const seats = response.seats || [];
        
        console.log('Seats loaded:', seats.length);
        
        if (seats.length === 0) {
            $('#seatSelection').html(`
                <div class="alert alert-warning text-center">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                    <h6>Нет доступных мест</h6>
                    <p class="mb-0">В выбранной зоне нет свободных мест</p>
                </div>
            `);
            return;
        }
        
        // Create seat map
        let seatHTML = '<div class="seat-map d-flex flex-wrap justify-content-center gap-2">';
        
        seats.forEach(seat => {
            const isBooked = seat.is_booked;
            const seatClass = isBooked ? 'seat booked' : 'seat available';
            const onclick = !isBooked ? `onclick="selectSeat(${seat.seat_id}, '${seat.seat_number}')"` : '';
            
            seatHTML += `
                <div class="${seatClass}" ${onclick} 
                     data-seat-id="${seat.seat_id}"
                     title="${isBooked ? 'Место занято' : 'Место ' + seat.seat_number + ' - ' + formatPrice(selectedZonePrice)}">
                    ${seat.seat_number}
                </div>
            `;
        });
        
        seatHTML += '</div>';
        
        $('#seatSelection').html(seatHTML);
        
    } catch (error) {
        console.error('Error loading seats:', error);
        $('#seatSelection').html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Ошибка загрузки мест: ${error.message}
            </div>
        `);
    }
};

window.selectSeat = function(seatId, seatNumber) {
    console.log('Selecting seat:', seatId, seatNumber);
    
    // Update selection
    selectedSeatId = seatId;
    
    // Update UI
    $('.seat').removeClass('selected');
    $(`.seat[data-seat-id="${seatId}"]`).addClass('selected');
    
    // Update booking summary
    $('#selectedSeatInfo').text(`Место ${seatNumber}`);
    $('#confirmBookingBtn').prop('disabled', false);
};

window.proceedToBooking = async function() {
    try {
        if (!selectedZoneId || !selectedSeatId) {
            showError('Пожалуйста, выберите зону и место');
            return;
        }
        
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему');
            showLoginModal();
            return;
        }
        
        const event = window.currentBookingEvent;
        if (!event) {
            showError('Информация о мероприятии недоступна');
            return;
        }
        
        console.log('Creating booking:', {
            eventId: event.event_id,
            seatId: selectedSeatId,
            zonePrice: selectedZonePrice
        });
        
        // Disable booking button
        const bookingBtn = $('#confirmBookingBtn');
        const originalText = bookingBtn.html();
        bookingBtn.prop('disabled', true)
                  .html('<i class="fas fa-spinner fa-spin me-1"></i>Создание...');
        
        // Create booking using the function from bookings.js
        await createBooking(event.event_id, selectedSeatId, selectedZonePrice);
        
    } catch (error) {
        console.error('Booking error:', error);
        showError(error.message || 'Ошибка создания бронирования');
        
        // Restore button
        $('#confirmBookingBtn').prop('disabled', false)
                              .html('<i class="fas fa-check me-1"></i>Создать бронирование');
    }
};

window.resetBookingSelection = function() {
    console.log('Resetting booking selection');
    
    // Reset selection variables
    selectedZoneId = null;
    selectedSeatId = null;
    selectedZonePrice = 0;
    selectedZoneName = '';
    
    // Reset UI
    $('.zone-card').removeClass('selected');
    $('.seat').removeClass('selected');
    $('#seatSelectionCard').addClass('d-none');
    
    // Reset summary
    $('#selectedZoneInfo').text('Не выбрана');
    $('#selectedSeatInfo').text('Не выбрано');
    $('#selectedPriceInfo').text('Не указана');
    $('#confirmBookingBtn').prop('disabled', true);
};

// Load events page
async function loadEvents() {
    try {
        console.log('Loading events page...');
        
        let events = [];
        let categories = [];
        let zones = [];
        
        // Show loading
        $('#content').html(`
            <div class="d-flex justify-content-center align-items-center" style="min-height: 300px;">
                <div class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Загрузка...</span>
                    </div>
                    <p class="mt-3 text-muted">Загрузка мероприятий...</p>
                </div>
            </div>
        `);
        
        try {
            // Load events with error handling for each request
            console.log('Fetching events...');
            const eventsResponse = await apiRequest('/events/', { timeout: 10000 });
            events = eventsResponse?.events || [];
            console.log('Events loaded:', events.length);
            
            console.log('Fetching categories...');
            const categoriesResponse = await apiRequest('/events/categories', { timeout: 10000 });
            categories = categoriesResponse || [];
            console.log('Categories loaded:', categories.length);
            
            console.log('Fetching zones...');
            const zonesResponse = await apiRequest('/events/zones', { timeout: 10000 });
            zones = zonesResponse || [];
            console.log('Zones loaded:', zones.length);
            
        } catch (error) {
            console.error('Error loading events data:', error);
            // Continue with empty arrays - don't fail completely
            events = [];
            categories = [];
            zones = [];
        }
        
        // Store data globally
        window.eventsData = events;
        window.categoriesData = categories;
        window.zonesData = zones;
        
        // Check if user has admin or moderator role
        const isAdminOrModerator = currentUser && 
                                   currentUser.role && 
                                   ['admin', 'moderator'].includes(currentUser.role);
        
        console.log('Current user:', currentUser);
        console.log('Is admin or moderator:', isAdminOrModerator);
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2><i class="fas fa-calendar-alt me-2"></i>Мероприятия</h2>
                    <p class="text-muted">Выберите интересующее вас мероприятие и забронируйте места</p>
                </div>
                ${isAdminOrModerator ? `
                    <div class="col-auto">
                        <button class="btn btn-primary" onclick="showCreateEventModal()">
                            <i class="fas fa-plus me-1"></i>Создать мероприятие
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Add filters if we have categories
        if (categories.length > 0) {
            html += `
                <div class="row mb-4">
                    <div class="col">
                        <div class="card">
                            <div class="card-body">
                                <h6><i class="fas fa-filter me-1"></i>Фильтры</h6>
                                <div class="row">
                                    <div class="col-md-4">
                                        <label class="form-label">Категория</label>
                                        <select class="form-select" id="categoryFilter" onchange="filterEvents()">
                                            <option value="">Все категории</option>
                                            ${categories.map(cat => `
                                                <option value="${cat.category_id}">${cat.name}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">От даты</label>
                                        <input type="date" class="form-control" id="dateFromFilter" onchange="filterEvents()">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">До даты</label>
                                        <input type="date" class="form-control" id="dateToFilter" onchange="filterEvents()">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label">&nbsp;</label>
                                        <button class="btn btn-outline-secondary w-100" onclick="clearFilters()">
                                            <i class="fas fa-times me-1"></i>Очистить
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        html += '<div class="row" id="eventsContainer">';
        
        if (events.length === 0) {
            html += `
                <div class="col-12">
                    <div class="alert alert-info text-center">
                        <i class="fas fa-calendar-alt fa-3x mb-3 text-muted"></i>
                        <h5>Нет доступных мероприятий</h5>
                        <p class="mb-0">В настоящее время нет запланированных мероприятий.</p>
                        ${isAdminOrModerator ? `
                            <button class="btn btn-primary mt-3" onclick="showCreateEventModal()">
                                <i class="fas fa-plus me-1"></i>Создать первое мероприятие
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        } else {
            events.forEach(event => {
                const occupancyPercentage = event.capacity > 0 ? 
                    Math.round((event.booked_seats / event.capacity) * 100) : 0;
                const isFullyBooked = event.booked_seats >= event.capacity;
                
                // Calculate price range for zones
                let priceInfo = '';
                if (event.zones && event.zones.length > 0) {
                    const prices = event.zones
                        .filter(zone => zone.zone_price != null)
                        .map(zone => zone.zone_price);
                    
                    if (prices.length > 0) {
                        const minPrice = Math.min(...prices);
                        const maxPrice = Math.max(...prices);
                        
                        if (minPrice === maxPrice) {
                            priceInfo = formatPrice(minPrice);
                        } else {
                            priceInfo = `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`;
                        }
                    } else {
                        priceInfo = formatPrice(event.ticket_price || 0);
                    }
                } else {
                    priceInfo = formatPrice(event.ticket_price || 0);
                }
                
                html += `
                    <div class="col-lg-4 col-md-6 mb-4" data-category="${event.category_id || ''}" data-date="${event.event_date}">
                        <div class="card event-card h-100">
                            <div class="card-body d-flex flex-column">
                                <div class="d-flex justify-content-between align-items-start mb-2">
                                    <span class="badge bg-primary">${event.category_name || 'Без категории'}</span>
                                    ${isFullyBooked ? '<span class="badge bg-danger">Мест нет</span>' : ''}
                                </div>
                                
                                <h5 class="card-title">${event.title}</h5>
                                <p class="card-text text-muted flex-grow-1">${event.description || ''}</p>
                                
                                <div class="mt-auto">
                                    <div class="row mb-3">
                                        <div class="col">
                                            <small class="text-muted">
                                                <i class="fas fa-calendar me-1"></i>${formatDate(event.event_date)}
                                            </small>
                                        </div>
                                    </div>
                                    
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <div>
                                            <strong class="text-success">${priceInfo}</strong>
                                            ${event.zones && event.zones.length > 1 ? `
                                                <br><small class="text-muted">${event.zones.length} зон</small>
                                            ` : ''}
                                        </div>
                                        <small class="text-muted">
                                            <i class="fas fa-users me-1"></i>${event.booked_seats || 0}/${event.capacity || 0}
                                        </small>
                                    </div>
                                    
                                    <div class="mb-3">
                                        <div class="d-flex justify-content-between align-items-center mb-1">
                                            <small class="text-muted">Заполненность</small>
                                            <small class="text-muted">${occupancyPercentage}%</small>
                                        </div>
                                        <div class="progress" style="height: 6px;">
                                            <div class="progress-bar ${
                                                occupancyPercentage > 80 ? 'bg-warning' : 
                                                occupancyPercentage > 50 ? 'bg-info' : 'bg-success'
                                            }" 
                                                 role="progressbar" style="width: ${occupancyPercentage}%">
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Zone Information -->
                                    ${event.zones && event.zones.length > 0 ? `
                                        <div class="mb-3">
                                            <small class="text-muted d-block mb-1">Доступные зоны:</small>
                                            <div class="d-flex flex-wrap gap-1">
                                                ${event.zones.slice(0, 3).map(zone => `
                                                    <span class="badge bg-light text-dark" title="${zone.zone_name} - ${formatPrice(zone.zone_price)}">
                                                        ${zone.zone_name}
                                                    </span>
                                                `).join('')}
                                                ${event.zones.length > 3 ? `
                                                    <span class="badge bg-secondary">+${event.zones.length - 3}</span>
                                                ` : ''}
                                            </div>
                                        </div>
                                    ` : ''}
                                    
                                    <div class="d-grid gap-2">
                                        ${currentUser ? `
                                            ${isFullyBooked ? `
                                                <button class="btn btn-secondary" disabled>
                                                    <i class="fas fa-ban me-1"></i>Мест нет
                                                </button>
                                            ` : `
                                                <button class="btn btn-primary" onclick="showBookingModal(${event.event_id})">
                                                    <i class="fas fa-ticket-alt me-1"></i>Забронировать
                                                </button>
                                            `}
                                        ` : `
                                            <button class="btn btn-outline-primary" onclick="showLoginModal()">
                                                <i class="fas fa-sign-in-alt me-1"></i>Войти для бронирования
                                            </button>
                                        `}
                                        
                                        <button class="btn btn-outline-info btn-sm" onclick="showEventDetails(${event.event_id})">
                                            <i class="fas fa-info-circle me-1"></i>Подробнее
                                        </button>
                                        
                                        ${isAdminOrModerator ? `
                                            <div class="btn-group mt-2" role="group">
                                                <button class="btn btn-sm btn-outline-secondary" onclick="showEditEventModal(${event.event_id})">
                                                    <i class="fas fa-edit me-1"></i>Изменить
                                                </button>
                                                <button class="btn btn-sm btn-outline-danger" onclick="deleteEvent(${event.event_id})">
                                                    <i class="fas fa-trash me-1"></i>Удалить
                                                </button>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        $('#content').html(html);
        
        console.log('Events page loaded successfully');
        
    } catch (error) {
        console.error('Critical error loading events page:', error);
        $('#content').html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Ошибка загрузки мероприятий</strong>
                <p class="mb-2">Не удалось загрузить список мероприятий.</p>
                <details>
                    <summary>Подробности ошибки</summary>
                    <pre class="mt-2">${error.message}</pre>
                </details>
                <button class="btn btn-primary mt-2" onclick="loadEvents()">
                    <i class="fas fa-redo me-1"></i>Попробовать снова
                </button>
            </div>
        `);
    }
}
// Make immediately available
window.loadEvents = loadEvents;

// Enhanced create event modal with better error handling
function showCreateEventModal() {
    console.log('Showing create event modal...');
    
    // Check authentication and permissions
    if (!currentUser) {
        showError('Пожалуйста, войдите в систему');
        showLoginModal();
        return;
    }
    
    if (!['admin', 'moderator'].includes(currentUser.role)) {
        showError('У вас нет прав для создания мероприятий');
        return;
    }
    
    const zones = window.zonesData || [];
    const categories = window.categoriesData || [];
    
    if (zones.length === 0) {
        showError('Нет доступных зон. Обратитесь к администратору.');
        return;
    }
    
    const modal = `
        <div class="modal fade" id="createEventModal" tabindex="-1">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-plus me-2"></i>Создание мероприятия
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="createEventForm">
                            <div class="row">
                                <div class="col-lg-8">
                                    <!-- Basic Event Info -->
                                    <div class="card mb-3">
                                        <div class="card-header">
                                            <h6 class="mb-0">
                                                <i class="fas fa-info-circle me-1"></i>Основная информация
                                            </h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="row">
                                                <div class="col-md-8">
                                                    <div class="mb-3">
                                                        <label class="form-label">Название мероприятия *</label>
                                                        <input type="text" class="form-control" name="title" required 
                                                               placeholder="Введите название мероприятия">
                                                    </div>
                                                </div>
                                                <div class="col-md-4">
                                                    <div class="mb-3">
                                                        <label class="form-label">Категория</label>
                                                        <select class="form-select" name="category_id">
                                                            <option value="">Без категории</option>
                                                            ${categories.map(cat => `
                                                                <option value="${cat.category_id}">${cat.name}</option>
                                                            `).join('')}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div class="mb-3">
                                                <label class="form-label">Описание *</label>
                                                <textarea class="form-control" name="description" rows="3" required
                                                          placeholder="Опишите мероприятие"></textarea>
                                            </div>
                                            
                                            <div class="row">
                                                <div class="col-md-6">
                                                    <div class="mb-3">
                                                        <label class="form-label">Дата и время *</label>
                                                        <input type="datetime-local" class="form-control" name="event_date" required>
                                                    </div>
                                                </div>
                                                <div class="col-md-6">
                                                    <div class="mb-3">
                                                        <label class="form-label">Длительность (минуты) *</label>
                                                        <input type="number" class="form-control" name="duration" required 
                                                               min="30" value="120" placeholder="120">
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Zones Configuration -->
                                    <div class="card">
                                        <div class="card-header">
                                            <h6 class="mb-0">
                                                <i class="fas fa-map-marked-alt me-1"></i>Конфигурация зон
                                            </h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="alert alert-info">
                                                <i class="fas fa-info-circle me-2"></i>
                                                Выберите зоны, которые будут доступны для данного мероприятия, 
                                                и укажите количество мест и цену для каждой зоны.
                                            </div>
                                            
                                            <div id="zonesConfiguration">
                                                ${zones.map((zone, index) => `
                                                    <div class="card mb-3 zone-config-card" data-zone-id="${zone.zone_id}">
                                                        <div class="card-body">
                                                            <div class="row align-items-center">
                                                                <div class="col-md-3">
                                                                    <div class="form-check">
                                                                        <input class="form-check-input zone-checkbox" type="checkbox" 
                                                                               id="zone_${zone.zone_id}" value="${zone.zone_id}"
                                                                               onchange="toggleZoneConfig(${zone.zone_id})">
                                                                        <label class="form-check-label" for="zone_${zone.zone_id}">
                                                                            <strong>${zone.name}</strong>
                                                                            <br><small class="text-muted">${zone.description || 'Стандартная зона'}</small>
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                                <div class="col-md-4">
                                                                    <label class="form-label">Доступно мест</label>
                                                                    <input type="number" class="form-control zone-seats" 
                                                                           name="zone_${zone.zone_id}_seats"
                                                                           min="1" max="${zone.total_seats || zone.capacity}" 
                                                                           value="${zone.total_seats || zone.capacity}"
                                                                           disabled>
                                                                    <small class="text-muted">Макс: ${zone.total_seats || zone.capacity}</small>
                                                                </div>
                                                                <div class="col-md-4">
                                                                    <label class="form-label">Цена билета (₽)</label>
                                                                    <input type="number" class="form-control zone-price" 
                                                                           name="zone_${zone.zone_id}_price"
                                                                           min="0" step="0.01" placeholder="0.00"
                                                                           disabled>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="col-lg-4">
                                    <!-- Summary -->
                                    <div class="card sticky-top" style="top: 20px;">
                                        <div class="card-header">
                                            <h6 class="mb-0">
                                                <i class="fas fa-calculator me-1"></i>Сводка
                                            </h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="summary-item mb-3">
                                                <strong>Выбрано зон:</strong>
                                                <span id="selectedZonesCount">0</span>
                                            </div>
                                            <div class="summary-item mb-3">
                                                <strong>Общая вместимость:</strong>
                                                <span id="totalCapacity">0</span> мест
                                            </div>
                                            <div class="summary-item mb-3">
                                                <strong>Диапазон цен:</strong>
                                                <span id="priceRange">Не указано</span>
                                            </div>
                                            
                                            <div class="alert alert-warning">
                                                <i class="fas fa-exclamation-triangle me-2"></i>
                                                <small>Выберите хотя бы одну зону для создания мероприятия</small>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            Отмена
                        </button>
                        <button type="button" class="btn btn-primary" id="createEventBtn" onclick="createEventWithZones()" disabled>
                            <i class="fas fa-save me-1"></i>Создать мероприятие
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    $('#createEventModal').remove();
    
    // Add new modal to DOM and show it
    $('body').append(modal);
    $('#createEventModal').modal('show');
    
    // Set minimum date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().slice(0, 16);
    document.querySelector('input[name="event_date"]').min = minDate;
    
    // Initialize summary
    updateEventSummary();
    
    console.log('Create event modal shown with zones');
}
// Make immediately available
window.showCreateEventModal = showCreateEventModal;

// Toggle zone configuration
function toggleZoneConfig(zoneId) {
    const checkbox = document.getElementById(`zone_${zoneId}`);
    const seatsInput = document.querySelector(`input[name="zone_${zoneId}_seats"]`);
    const priceInput = document.querySelector(`input[name="zone_${zoneId}_price"]`);
    
    const isEnabled = checkbox.checked;
    seatsInput.disabled = !isEnabled;
    priceInput.disabled = !isEnabled;
    
    if (isEnabled) {
        seatsInput.required = true;
        priceInput.required = true;
    } else {
        seatsInput.required = false;
        priceInput.required = false;
        seatsInput.value = seatsInput.max;
        priceInput.value = '';
    }
    
    updateEventSummary();
}
// Make immediately available
window.toggleZoneConfig = toggleZoneConfig;

// Update event summary
function updateEventSummary() {
    const selectedZones = document.querySelectorAll('.zone-checkbox:checked');
    const createBtn = document.getElementById('createEventBtn');
    
    let totalCapacity = 0;
    let prices = [];
    
    selectedZones.forEach(checkbox => {
        const zoneId = checkbox.value;
        const seatsInput = document.querySelector(`input[name="zone_${zoneId}_seats"]`);
        const priceInput = document.querySelector(`input[name="zone_${zoneId}_price"]`);
        
        if (seatsInput.value) {
            totalCapacity += parseInt(seatsInput.value);
        }
        
        if (priceInput.value) {
            prices.push(parseFloat(priceInput.value));
        }
    });
    
    // Update summary
    document.getElementById('selectedZonesCount').textContent = selectedZones.length;
    document.getElementById('totalCapacity').textContent = totalCapacity;
    
    if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        if (minPrice === maxPrice) {
            document.getElementById('priceRange').textContent = formatPrice(minPrice);
        } else {
            document.getElementById('priceRange').textContent = 
                `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`;
        }
    } else {
        document.getElementById('priceRange').textContent = 'Не указано';
    }
    
    // Enable/disable create button
    if (createBtn) {
        createBtn.disabled = selectedZones.length === 0;
    }
}
// Make immediately available
window.updateEventSummary = updateEventSummary;

// Listen for changes in zone inputs
$(document).on('input', '.zone-seats, .zone-price', updateEventSummary);

// Create event with zones
async function createEventWithZones() {
    console.log('Creating event with zones...');
    
    // Check authentication first
    if (!currentUser) {
        showError('Пожалуйста, войдите в систему');
        showLoginModal();
        return;
    }
    
    if (!['admin', 'moderator'].includes(currentUser.role)) {
        showError('У вас нет прав для создания мероприятий');
        return;
    }
    
    const form = document.getElementById('createEventForm');
    const submitBtn = document.getElementById('createEventBtn');
    const originalText = submitBtn.innerHTML;
    
    // Get form data
    const formData = new FormData(form);
    
    // Validate basic fields
    const title = formData.get('title')?.trim();
    const description = formData.get('description')?.trim();
    const eventDate = formData.get('event_date');
    const duration = parseInt(formData.get('duration'));
    
    if (!title || !description || !eventDate || !duration) {
        showError('Пожалуйста, заполните все обязательные поля');
        return;
    }
    
    // Get selected zones
    const selectedZones = [];
    const zoneCheckboxes = document.querySelectorAll('.zone-checkbox:checked');
    
    if (zoneCheckboxes.length === 0) {
        showError('Выберите хотя бы одну зону для мероприятия');
        return;
    }
    
    for (const checkbox of zoneCheckboxes) {
        const zoneId = parseInt(checkbox.value);
        const seatsInput = document.querySelector(`input[name="zone_${zoneId}_seats"]`);
        const priceInput = document.querySelector(`input[name="zone_${zoneId}_price"]`);
        
        const seats = parseInt(seatsInput.value);
        const price = parseFloat(priceInput.value);
        
        if (!seats || seats < 1 || !price || price < 0) {
            showError('Заполните корректно данные для всех выбранных зон');
            return;
        }
        
        selectedZones.push({
            zone_id: zoneId,
            available_seats: seats,
            zone_price: price
        });
    }
    
    try {
        // Disable submit button and show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Создание...';
        
        const eventData = {
            title: title,
            description: description,
            event_date: new Date(eventDate).toISOString(),
            duration: duration,
            zones: selectedZones,
            status: "planned"
        };
        
        // Add category if selected
        const categoryId = formData.get('category_id');
        if (categoryId) {
            eventData.category_id = parseInt(categoryId);
        }
        
        console.log('Sending event data:', eventData);
        
        const response = await apiRequest('/events/', {
            method: 'POST',
            body: JSON.stringify(eventData)
        });
        
        console.log('Event created:', response);
        
        // Close modal and reload events
        $('#createEventModal').modal('hide');
        showSuccess('Мероприятие успешно создано');
        
        // Reload events page
        await loadEvents();
        
    } catch (error) {
        console.error('Create event error:', error);
        showError(error.message || 'Не удалось создать мероприятие');
    } finally {
        // Restore submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Show event details modal
async function showEventDetails(eventId) {
    try {
        const event = await apiRequest(`/events/${eventId}`);
        
        let zonesInfo = '';
        if (event.zones && event.zones.length > 0) {
            zonesInfo = `
                <h6 class="mt-3">
                    <i class="fas fa-map-marked-alt me-1"></i>Конфигурация зон
                </h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Зона</th>
                                <th>Мест</th>
                                <th>Цена</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${event.zones.map(zone => `
                                <tr>
                                    <td>${zone.zone_name}</td>
                                    <td>${zone.available_seats}</td>
                                    <td><strong>${formatPrice(zone.zone_price)}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        const modal = `
            <div class="modal fade" id="eventDetailsModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-calendar-alt me-2"></i>${event.title}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-8">
                                    <h6><i class="fas fa-info-circle me-1"></i>Описание</h6>
                                    <p>${event.description}</p>
                                    
                                    <h6><i class="fas fa-clock me-1"></i>Время проведения</h6>
                                    <p>
                                        <strong>Дата:</strong> ${formatDate(event.event_date)}<br>
                                        ${event.duration ? `<strong>Длительность:</strong> ${event.duration}` : ''}
                                    </p>
                                    
                                    ${zonesInfo}
                                </div>
                                <div class="col-md-4">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6 class="mb-0">
                                                <i class="fas fa-chart-pie me-1"></i>Статистика
                                            </h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between mb-2">
                                                <span>Забронировано:</span>
                                                <strong>${event.booked_seats || 0}</strong>
                                            </div>
                                            <div class="d-flex justify-content-between mb-2">
                                                <span>Всего мест:</span>
                                                <strong>${event.capacity || 0}</strong>
                                            </div>
                                            <div class="d-flex justify-content-between mb-3">
                                                <span>Свободно:</span>
                                                <strong>${(event.capacity || 0) - (event.booked_seats || 0)}</strong>
                                            </div>
                                            
                                            <div class="progress mb-2">
                                                <div class="progress-bar" role="progressbar" 
                                                     style="width: ${(event.booked_seats || 0) / (event.capacity || 1) * 100}%">
                                                    ${Math.round((event.booked_seats || 0) / (event.capacity || 1) * 100)}%
                                                </div>
                                            </div>
                                            <small class="text-muted">Заполненность мероприятия</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            ${currentUser && (event.booked_seats || 0) < (event.capacity || 0) ? `
                                <button type="button" class="btn btn-primary" onclick="$('#eventDetailsModal').modal('hide'); showBookingModal(${event.event_id})">
                                    <i class="fas fa-ticket-alt me-1"></i>Забронировать билет
                                </button>
                            ` : ''}
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        $('#eventDetailsModal').remove();
        
        // Add new modal to DOM and show it
        $('body').append(modal);
        $('#eventDetailsModal').modal('show');
        
    } catch (error) {
        showError('Не удалось загрузить информацию о мероприятии');
    }
}

// Show booking modal
async function showBookingModal(eventId) {
    try {
        if (!currentUser) {
            showLoginModal();
            return;
        }
        
        console.log('Loading booking modal for event:', eventId);
        
        // Show loading modal first
        const loadingModal = `
            <div class="modal fade" id="bookingModal" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-ticket-alt me-2"></i>Бронирование билетов
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="d-flex justify-content-center align-items-center" style="min-height: 200px;">
                                <div class="text-center">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">Загрузка...</span>
                                    </div>
                                    <p class="mt-3 text-muted">Загрузка информации о мероприятии...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        $('#bookingModal').remove();
        $('body').append(loadingModal);
        $('#bookingModal').modal('show');
        
        // Load event details
        const event = await apiRequest(`/events/${eventId}`);
        console.log('Event loaded for booking:', event);
        
        if (!event.zones || event.zones.length === 0) {
            $('#bookingModal .modal-body').html(`
                <div class="alert alert-warning text-center">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                    <h4>Конфигурация зон недоступна</h4>
                    <p>Для этого мероприятия не настроены зоны. Обратитесь к администратору.</p>
                </div>
            `);
            return;
        }
        
        // Check if event is bookable
        if (event.status !== 'planned') {
            $('#bookingModal .modal-body').html(`
                <div class="alert alert-danger text-center">
                    <i class="fas fa-ban fa-3x mb-3"></i>
                    <h4>Бронирование недоступно</h4>
                    <p>Статус мероприятия: <strong>${event.status}</strong></p>
                    <p>Бронирование доступно только для запланированных мероприятий.</p>
                </div>
            `);
            return;
        }
        
        if (new Date(event.event_date) <= new Date()) {
            $('#bookingModal .modal-body').html(`
                <div class="alert alert-danger text-center">
                    <i class="fas fa-clock fa-3x mb-3"></i>
                    <h4>Мероприятие уже началось</h4>
                    <p>Бронирование билетов на прошедшие мероприятия невозможно.</p>
                </div>
            `);
            return;
        }
        
        // Build the full booking modal
        let html = `
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="fas fa-ticket-alt me-2"></i>Бронирование билетов - ${event.title}
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="row">
                    <div class="col-lg-8">
                        <!-- Event Info -->
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6><i class="fas fa-info-circle me-1"></i>О мероприятии</h6>
                                <p class="mb-1"><strong>${event.title}</strong></p>
                                <p class="text-muted mb-2">${event.description}</p>
                                <small class="text-muted">
                                    <i class="fas fa-calendar me-1"></i>${formatDate(event.event_date)}
                                    ${event.duration ? `• <i class="fas fa-clock me-1"></i>${event.duration}` : ''}
                                </small>
                            </div>
                        </div>
                        
                        <!-- Zone Selection -->
                        <div class="card mb-3">
                            <div class="card-header">
                                <h6 class="mb-0">
                                    <i class="fas fa-map-marked-alt me-1"></i>Шаг 1: Выберите зону
                                </h6>
                            </div>
                            <div class="card-body">
                                <div class="row" id="zoneSelection">
                                    ${event.zones.map(zone => {
                                        const availableSeats = zone.available_seats || 0;
                                        const isUnavailable = availableSeats === 0;
                                        
                                        return `
                                            <div class="col-md-6 mb-3">
                                                <div class="card zone-card ${isUnavailable ? 'disabled' : 'selectable'}" 
                                                     onclick="${!isUnavailable ? `selectZoneForBooking(${zone.zone_id}, ${eventId}, '${zone.zone_name}', ${zone.zone_price})` : ''}"
                                                     style="${isUnavailable ? 'opacity: 0.5; cursor: not-allowed;' : 'cursor: pointer;'}"
                                                     data-zone-id="${zone.zone_id}">
                                                    <div class="card-body text-center">
                                                        <h6 class="card-title">${zone.zone_name}</h6>
                                                        <p class="card-text text-muted mb-2">${zone.zone_description || 'Стандартная зона'}</p>
                                                        <div class="d-flex justify-content-between align-items-center">
                                                            <span class="badge ${isUnavailable ? 'bg-danger' : 'bg-primary'}">
                                                                ${availableSeats} ${availableSeats === 1 ? 'место' : 'мест'}
                                                            </span>
                                                            <strong class="text-success fs-6">
                                                                ${formatPrice(zone.zone_price)}
                                                            </strong>
                                                        </div>
                                                        ${isUnavailable ? 
                                                            '<small class="text-danger mt-2 d-block">Мест нет</small>' : 
                                                            '<small class="text-muted mt-2 d-block">Нажмите для выбора</small>'
                                                        }
                                                    </div>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Seat Selection (initially hidden) -->
                        <div class="card d-none" id="seatSelectionCard">
                            <div class="card-header">
                                <h6 class="mb-0">
                                    <i class="fas fa-chair me-1"></i>Шаг 2: Выберите место
                                </h6>
                            </div>
                            <div class="card-body">
                                <div class="seat-legend mb-3 text-center">
                                    <span class="badge bg-light text-dark me-2">
                                        <i class="fas fa-square me-1"></i>Свободно
                                    </span>
                                    <span class="badge bg-success me-2">
                                        <i class="fas fa-square me-1"></i>Выбрано
                                    </span>
                                    <span class="badge bg-danger">
                                        <i class="fas fa-square me-1"></i>Занято
                                    </span>
                                </div>
                                <div id="seatSelection">
                                    <!-- Seats will be loaded here -->
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Booking Summary -->
                    <div class="col-lg-4">
                        <div class="card sticky-top" style="top: 20px;">
                            <div class="card-header">
                                <h6 class="mb-0">
                                    <i class="fas fa-receipt me-1"></i>Сводка бронирования
                                </h6>
                            </div>
                            <div class="card-body">
                                <div class="mb-3">
                                    <strong>Мероприятие:</strong><br>
                                    <span class="text-muted">${event.title}</span>
                                </div>
                                <div class="mb-3">
                                    <strong>Дата:</strong><br>
                                    <span class="text-muted">${formatDate(event.event_date)}</span>
                                </div>
                                <div class="mb-3">
                                    <strong>Выбранная зона:</strong><br>
                                    <span id="selectedZoneInfo" class="text-muted">Не выбрана</span>
                                </div>
                                <div class="mb-3">
                                    <strong>Выбранное место:</strong><br>
                                    <span id="selectedSeatInfo" class="text-muted">Не выбрано</span>
                                </div>
                                <div class="mb-3">
                                    <strong>Цена:</strong><br>
                                    <span id="selectedPriceInfo" class="text-success fs-5">Не указана</span>
                                </div>
                                
                                <!-- Booking Actions -->
                                <div class="d-grid gap-2">
                                    <button class="btn btn-primary" id="confirmBookingBtn" disabled 
                                            onclick="proceedToBooking()">
                                        <i class="fas fa-check me-1"></i>Создать бронирование
                                    </button>
                                    <button class="btn btn-outline-secondary" onclick="resetBookingSelection()">
                                        <i class="fas fa-undo me-1"></i>Сбросить выбор
                                    </button>
                                </div>
                                
                                <div class="alert alert-info mt-3">
                                    <i class="fas fa-info-circle me-2"></i>
                                    <small>
                                        После создания бронирования у вас будет 15 минут для оплаты. 
                                        Неоплаченные бронирования автоматически отменяются.
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Update modal content
        $('#bookingModal .modal-content').html(html);
        
        // Store event data for booking
        window.currentBookingEvent = event;
        
        // Reset booking selection state
        resetBookingSelection();
        
        console.log('Booking modal loaded successfully');
        
    } catch (error) {
        console.error('Error loading booking modal:', error);
        $('#bookingModal .modal-body').html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Ошибка загрузки</strong>
                <p class="mb-2">Не удалось загрузить информацию для бронирования.</p>
                <details>
                    <summary>Подробности ошибки</summary>
                    <pre class="mt-2">${error.message}</pre>
                </details>
                <button class="btn btn-primary mt-2" onclick="showBookingModal(${eventId})">
                    <i class="fas fa-redo me-1"></i>Попробовать снова
                </button>
            </div>
        `);
    }
}
// Make immediately available
window.showBookingModal = showBookingModal;

// Make all other functions immediately available
window.showEventDetails = async function(eventId) { return await showEventDetails(eventId); };
window.showEditEventModal = async function(eventId) { return await showEditEventModal(eventId); };
window.filterEvents = function() { return filterEvents(); };
window.clearFilters = function() { return clearFilters(); };
window.deleteEvent = async function(eventId) { return await deleteEvent(eventId); };
window.createEventWithZones = async function() { return await createEventWithZones(); };

// Make all remaining functions immediately available
window.loadEvents = loadEvents;
window.showCreateEventModal = showCreateEventModal;
window.showBookingModal = showBookingModal;
window.showEventDetails = showEventDetails;
window.showEditEventModal = showEditEventModal;
window.filterEvents = filterEvents;
window.clearFilters = clearFilters;
window.deleteEvent = deleteEvent;
window.createEventWithZones = createEventWithZones;
window.toggleZoneConfig = toggleZoneConfig;
window.updateEventSummary = updateEventSummary;