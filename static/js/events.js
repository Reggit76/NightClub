// Improved events.js with zone support
// Load events page
async function loadEvents() {
    try {
        console.log('Loading events...');
        
        let events = [];
        let categories = [];
        let zones = [];
        
        try {
            // Load events, categories, and zones
            const [eventsResponse, categoriesResponse, zonesResponse] = await Promise.allSettled([
                apiRequest('/events/'),
                apiRequest('/events/categories'),
                apiRequest('/events/zones')
            ]);
            
            if (eventsResponse.status === 'fulfilled') {
                events = eventsResponse.value.events || [];
            } else {
                console.warn('Failed to load events:', eventsResponse.reason);
                events = [];
            }
            
            if (categoriesResponse.status === 'fulfilled') {
                categories = categoriesResponse.value || [];
            } else {
                console.warn('Failed to load categories:', categoriesResponse.reason);
                categories = [];
            }
            
            if (zonesResponse.status === 'fulfilled') {
                zones = zonesResponse.value || [];
            } else {
                console.warn('Failed to load zones:', zonesResponse.reason);
                zones = [];
            }
            
        } catch (error) {
            console.error('Error loading events data:', error);
            events = [];
            categories = [];
            zones = [];
        }
        
        console.log('Loaded events:', events.length, 'categories:', categories.length, 'zones:', zones.length);
        
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
            
            <!-- Filters -->
            ${categories.length > 0 ? `
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
            ` : ''}
            
            <div class="row" id="eventsContainer">
        `;
        
        if (events.length === 0) {
            html += `
                <div class="col-12">
                    <div class="alert alert-info text-center">
                        <i class="fas fa-calendar-alt fa-3x mb-3 text-muted"></i>
                        <h5>Нет доступных мероприятий</h5>
                        <p class="mb-0">В настоящее время нет запланированных мероприятий. Проверьте позже!</p>
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
                const occupancyPercentage = Math.round((event.booked_seats / event.capacity) * 100);
                const isFullyBooked = event.booked_seats >= event.capacity;
                
                // Calculate price range for zones
                let priceInfo = '';
                if (event.zones && event.zones.length > 0) {
                    const prices = event.zones.map(zone => zone.zone_price);
                    const minPrice = Math.min(...prices);
                    const maxPrice = Math.max(...prices);
                    
                    if (minPrice === maxPrice) {
                        priceInfo = formatPrice(minPrice);
                    } else {
                        priceInfo = `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`;
                    }
                } else {
                    priceInfo = formatPrice(event.ticket_price);
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
                                <p class="card-text text-muted flex-grow-1">${event.description}</p>
                                
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
                                            <i class="fas fa-users me-1"></i>${event.booked_seats}/${event.capacity}
                                        </small>
                                    </div>
                                    
                                    <div class="mb-3">
                                        <div class="d-flex justify-content-between align-items-center mb-1">
                                            <small class="text-muted">Заполненность</small>
                                            <small class="text-muted">${occupancyPercentage}%</small>
                                        </div>
                                        <div class="progress" style="height: 6px;">
                                            <div class="progress-bar ${occupancyPercentage > 80 ? 'bg-warning' : occupancyPercentage > 50 ? 'bg-info' : 'bg-success'}" 
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
                                            <button class="btn btn-outline-primary" onclick="showLoginPrompt()">
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
        
        // Store data for filtering and other operations
        window.eventsData = events;
        window.categoriesData = categories;
        window.zonesData = zones;
        
        console.log('Events page loaded successfully');
        
    } catch (error) {
        console.error('Failed to load events page:', error);
        $('#content').html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Не удалось загрузить мероприятия. Пожалуйста, попробуйте позже.
                <br><small>Ошибка: ${error.message}</small>
            </div>
        `);
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
                                                <strong>${event.booked_seats}</strong>
                                            </div>
                                            <div class="d-flex justify-content-between mb-2">
                                                <span>Всего мест:</span>
                                                <strong>${event.capacity}</strong>
                                            </div>
                                            <div class="d-flex justify-content-between mb-3">
                                                <span>Свободно:</span>
                                                <strong>${event.capacity - event.booked_seats}</strong>
                                            </div>
                                            
                                            <div class="progress mb-2">
                                                <div class="progress-bar" role="progressbar" 
                                                     style="width: ${(event.booked_seats / event.capacity) * 100}%">
                                                    ${Math.round((event.booked_seats / event.capacity) * 100)}%
                                                </div>
                                            </div>
                                            <small class="text-muted">Заполненность мероприятия</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            ${currentUser && event.booked_seats < event.capacity ? `
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

// Enhanced create event modal with zones
function showCreateEventModal() {
    console.log('Showing create event modal with zones...');
    
    const zones = window.zonesData || [];
    const categories = window.categoriesData || [];
    
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
    createBtn.disabled = selectedZones.length === 0;
}

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
            status: "planned"  // Set initial status
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
        loadEvents();
        
    } catch (error) {
        console.error('Create event error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Не удалось создать мероприятие');
        }
    } finally {
        // Restore submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Enhanced booking modal with zone pricing
async function showBookingModal(eventId) {
    try {
        const event = await apiRequest(`/events/${eventId}`);
        
        if (!event.zones || event.zones.length === 0) {
            showError('Конфигурация зон для этого мероприятия недоступна');
        return;
    }
        
        let html = `
            <div class="modal fade" id="bookingModal" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-ticket-alt me-2"></i>Бронирование билетов - ${event.title}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-lg-8">
                                    <h6><i class="fas fa-map-marked-alt me-1"></i>Выберите зону</h6>
                                    <div class="row" id="zoneSelection">
                                        ${event.zones.map(zone => {
                                            // Calculate available seats for this zone
                                            const availableSeats = zone.available_seats; // This should come from backend
                                            const isUnavailable = availableSeats === 0;
                                            
                                            return `
                                                <div class="col-md-6 mb-3">
                                                    <div class="card zone-card ${isUnavailable ? 'disabled' : 'selectable'}" 
                                                         onclick="${!isUnavailable ? `selectZone(${zone.zone_id}, ${eventId})` : ''}"
                                                         style="${isUnavailable ? 'opacity: 0.5; cursor: not-allowed;' : 'cursor: pointer;'}">
                                                    <div class="card-body text-center">
                                                            <h6>${zone.zone_name}</h6>
                                                            <p class="text-muted mb-2">${zone.zone_description || 'Стандартная зона'}</p>
                                                            <div class="d-flex justify-content-between align-items-center">
                                                                <span class="badge ${isUnavailable ? 'bg-danger' : 'bg-primary'}">
                                                                    ${availableSeats} мест
                                                        </span>
                                                                <strong class="text-success">
                                                                    ${formatPrice(zone.zone_price)}
                                                                </strong>
                                                    </div>
                                                </div>
                                            </div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                    <div id="seatSelection"></div>
                                </div>
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
                                            <button class="btn btn-primary w-100" id="confirmBookingBtn" disabled>
                                                <i class="fas fa-check me-1"></i>Подтвердить бронирование
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        $('#bookingModal').remove();
        
        // Add new modal to DOM and show it
        $('body').append(html);
        $('#bookingModal').modal('show');
        
    } catch (error) {
        showError('Не удалось загрузить информацию о мероприятии');
    }
}

// Enhanced zone selection with pricing
async function selectZone(zoneId, eventId) {
    try {
        const response = await apiRequest(`/events/${eventId}/seats?zone_id=${zoneId}`);
        
        // Find zone info from the event data
        const event = await apiRequest(`/events/${eventId}`);
        const selectedZone = event.zones.find(z => z.zone_id === zoneId);
        
        if (!selectedZone) {
            showError('Информация о зоне не найдена');
            return;
        }
        
        // Update zone selection in summary
        $('#selectedZoneInfo').html(`
            <span class="text-primary">${selectedZone.zone_name}</span><br>
            <small class="text-muted">${selectedZone.zone_description || ''}</small>
        `);
        $('#selectedPriceInfo').text(formatPrice(selectedZone.zone_price));
        
        // Clear seat selection
        $('#selectedSeatInfo').html('<span class="text-muted">Выберите место</span>');
        $('#confirmBookingBtn').prop('disabled', true).removeData('seat-id').removeData('zone-price');
        
        let html = `
            <h6 class="mt-4">
                <i class="fas fa-chair me-1"></i>Выберите место в зоне "${selectedZone.zone_name}"
            </h6>
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
            <div class="seat-map">
        `;
        
        response.seats.forEach(seat => {
            html += `
                <div class="seat ${seat.is_booked ? 'booked' : 'available'}"
                     data-seat-id="${seat.seat_id}"
                     data-seat-number="${seat.seat_number}"
                     data-zone-price="${selectedZone.zone_price}"
                     title="Место ${seat.seat_number} - ${formatPrice(selectedZone.zone_price)}">
                    ${seat.seat_number}
                </div>
            `;
        });
        
        html += '</div>';
        
        $('#seatSelection').html(html);
        
        // Add seat selection handlers
        $('.seat.available').click(function() {
            $('.seat').removeClass('selected');
            $(this).addClass('selected');
            
            const seatNumber = $(this).data('seat-number');
            const zonePrice = $(this).data('zone-price');
            
            $('#selectedSeatInfo').html(`<span class="text-primary">Место ${seatNumber}</span>`);
            $('#confirmBookingBtn')
                .prop('disabled', false)
                .data('seat-id', $(this).data('seat-id'))
                .data('event-id', eventId)
                .data('zone-price', zonePrice);
        });
        
    } catch (error) {
        showError('Не удалось загрузить места');
    }
}

// Rest of the existing functions (filter, clear, edit, delete, etc.) remain the same
// ... (keeping the existing implementations)

// Filter events
function filterEvents() {
    const categoryFilter = document.getElementById('categoryFilter')?.value;
    const dateFromFilter = document.getElementById('dateFromFilter')?.value;
    const dateToFilter = document.getElementById('dateToFilter')?.value;
    
    const eventCards = document.querySelectorAll('[data-category]');
    
    eventCards.forEach(card => {
        let show = true;
        
        // Category filter
        if (categoryFilter && card.dataset.category !== categoryFilter) {
            show = false;
        }
        
        // Date filters
        const eventDate = new Date(card.dataset.date);
        if (dateFromFilter && eventDate < new Date(dateFromFilter)) {
            show = false;
        }
        if (dateToFilter && eventDate > new Date(dateToFilter + 'T23:59:59')) {
            show = false;
        }
        
        card.style.display = show ? 'block' : 'none';
    });
}

// Clear filters
function clearFilters() {
    const categoryFilter = document.getElementById('categoryFilter');
    const dateFromFilter = document.getElementById('dateFromFilter');
    const dateToFilter = document.getElementById('dateToFilter');
    
    if (categoryFilter) categoryFilter.value = '';
    if (dateFromFilter) dateFromFilter.value = '';
    if (dateToFilter) dateToFilter.value = '';
    
    filterEvents();
}

// Show login prompt
function showLoginPrompt() {
    $('#loginModal').modal('show');
}

// Delete event (existing implementation)
async function deleteEvent(eventId) {
    if (!confirm('Вы уверены, что хотите удалить это мероприятие?')) {
        return;
    }
    
    try {
        await apiRequest(`/events/${eventId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        showSuccess('Мероприятие успешно удалено');
        loadEvents();
    } catch (error) {
        console.error('Delete event error:', error);
        showError(error.message || 'Не удалось удалить мероприятие');
    }
}

// Existing edit modal and other functions would need similar updates for zones
// ... (implementations remain largely the same with zone support added)