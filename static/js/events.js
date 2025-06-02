// Load events page
async function loadEvents() {
    try {
        console.log('Loading events...');
        
        let events = [];
        let categories = [];
        
        try {
            // Load events and categories with proper error handling
            const [eventsResponse, categoriesResponse] = await Promise.allSettled([
                apiRequest('/events'),
                apiRequest('/events/categories')
            ]);
            
            if (eventsResponse.status === 'fulfilled') {
                events = eventsResponse.value || [];
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
            
        } catch (error) {
            console.error('Error loading events data:', error);
            events = [];
            categories = [];
        }
        
        console.log('Loaded events:', events.length, 'categories:', categories.length);
        
        // Check if user has admin or moderator role
        const isAdminOrModerator = currentUser && 
                                   currentUser.role && 
                                   ['admin', 'moderator'].includes(currentUser.role);
        
        console.log('Current user:', currentUser);
        console.log('Is admin or moderator:', isAdminOrModerator);
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2>Мероприятия</h2>
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
                                <h6>Фильтры</h6>
                                <div class="row">
                                    <div class="col-md-4">
                                        <select class="form-select" id="categoryFilter" onchange="filterEvents()">
                                            <option value="">Все категории</option>
                                            ${categories.map(cat => `
                                                <option value="${cat.category_id}">${cat.name}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <input type="date" class="form-control" id="dateFromFilter" onchange="filterEvents()">
                                    </div>
                                    <div class="col-md-3">
                                        <input type="date" class="form-control" id="dateToFilter" onchange="filterEvents()">
                                    </div>
                                    <div class="col-md-2">
                                        <button class="btn btn-outline-secondary w-100" onclick="clearFilters()">
                                            Очистить
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
                        <i class="fas fa-calendar-alt fa-2x mb-3"></i>
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
                html += `
                    <div class="col-lg-4 col-md-6 mb-4" data-category="${event.category_id || ''}" data-date="${event.event_date}">
                        <div class="card event-card h-100">
                            <div class="card-body d-flex flex-column">
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
                                        <span class="badge bg-primary">${event.category_name || 'Без категории'}</span>
                                        <span class="fw-bold text-success">${formatPrice(event.ticket_price)}</span>
                                    </div>
                                    
                                    <div class="mb-3">
                                        <div class="d-flex justify-content-between align-items-center mb-1">
                                            <small class="text-muted">Заполненность</small>
                                            <small class="text-muted">${event.booked_seats}/${event.capacity}</small>
                                        </div>
                                        <div class="progress">
                                            <div class="progress-bar ${occupancyPercentage > 80 ? 'bg-warning' : 'bg-success'}" 
                                                 role="progressbar" style="width: ${occupancyPercentage}%">
                                                ${occupancyPercentage}%
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="d-grid gap-2">
                                        ${currentUser ? `
                                            ${event.booked_seats >= event.capacity ? `
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
        
        // Store events data for filtering
        window.eventsData = events;
        window.categoriesData = categories;
        
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

// Show create event modal
function showCreateEventModal() {
    console.log('Showing create event modal...');
    console.log('Categories data:', window.categoriesData);
    
    const modal = `
        <div class="modal fade" id="createEventModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
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
                                            ${window.categoriesData ? window.categoriesData.map(cat => `
                                                <option value="${cat.category_id}">${cat.name}</option>
                                            `).join('') : ''}
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
                            
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Вместимость *</label>
                                        <input type="number" class="form-control" name="capacity" required 
                                               min="1" placeholder="Количество мест">
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Стоимость билета (₽) *</label>
                                        <input type="number" class="form-control" name="ticket_price" required 
                                               min="0" step="0.01" placeholder="0.00">
                                    </div>
                                </div>
                            </div>
                            
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle me-2"></i>
                                Все поля, отмеченные *, обязательны для заполнения.
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            Отмена
                        </button>
                        <button type="button" class="btn btn-primary" id="createEventBtn" onclick="createNewEvent()">
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
    
    console.log('Create event modal shown');
}

// Create event
async function createNewEvent() {
    console.log('Creating event...');
    
    const form = document.getElementById('createEventForm');
    const submitBtn = document.getElementById('createEventBtn');
    const originalText = submitBtn.innerHTML;
    
    // Get form data
    const formData = new FormData(form);
    
    // Validate required fields
    const title = formData.get('title')?.trim();
    const description = formData.get('description')?.trim();
    const eventDate = formData.get('event_date');
    const duration = parseInt(formData.get('duration'));
    const capacity = parseInt(formData.get('capacity'));
    const ticketPrice = parseFloat(formData.get('ticket_price'));
    
    console.log('Form data:', {title, description, eventDate, duration, capacity, ticketPrice});
    
    if (!title || !description || !eventDate || !duration || !capacity || ticketPrice < 0) {
        showError('Пожалуйста, заполните все обязательные поля');
        return;
    }
    
    // Additional validation
    if (duration < 30) {
        showError('Длительность мероприятия должна быть не менее 30 минут');
        return;
    }
    
    if (capacity < 1) {
        showError('Вместимость должна быть больше 0');
        return;
    }
    
    const eventDateTime = new Date(eventDate);
    if (eventDateTime <= new Date()) {
        showError('Дата мероприятия должна быть в будущем');
        return;
    }
    
    try {
        // Disable submit button and show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Создание...';
        
        // Check if user has permission
        if (!currentUser || !currentUser.role || !['admin', 'moderator'].includes(currentUser.role)) {
            throw new Error('У вас нет прав для создания мероприятий');
        }
        
        const eventData = {
            title: title,
            description: description,
            event_date: eventDateTime.toISOString(),
            duration: duration,
            capacity: capacity,
            ticket_price: ticketPrice
        };
        
        // Add category if selected
        const categoryId = formData.get('category_id');
        if (categoryId) {
            eventData.category_id = parseInt(categoryId);
        }
        
        console.log('Sending event data:', eventData);
        
        const response = await apiRequest('/events', {
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
        showError(error.message || 'Не удалось создать мероприятие');
    } finally {
        // Restore submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Show edit event modal
async function showEditEventModal(eventId) {
    try {
        const event = await apiRequest(`/events/${eventId}`);
        
        const modal = `
            <div class="modal fade" id="editEventModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-edit me-2"></i>Редактирование мероприятия
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="editEventForm">
                                <input type="hidden" name="event_id" value="${eventId}">
                                
                                <div class="row">
                                    <div class="col-md-8">
                                        <div class="mb-3">
                                            <label class="form-label">Название мероприятия *</label>
                                            <input type="text" class="form-control" name="title" required 
                                                   value="${event.title}">
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="mb-3">
                                            <label class="form-label">Категория</label>
                                            <select class="form-select" name="category_id">
                                                <option value="">Без категории</option>
                                                ${window.categoriesData ? window.categoriesData.map(cat => `
                                                    <option value="${cat.category_id}" ${event.category_id === cat.category_id ? 'selected' : ''}>
                                                        ${cat.name}
                                                    </option>
                                                `).join('') : ''}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label">Описание *</label>
                                    <textarea class="form-control" name="description" rows="3" required>${event.description}</textarea>
                                </div>
                                
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <label class="form-label">Дата и время *</label>
                                            <input type="datetime-local" class="form-control" name="event_date" required 
                                                   value="${new Date(event.event_date).toISOString().slice(0, 16)}">
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <label class="form-label">Длительность (минуты) *</label>
                                            <input type="number" class="form-control" name="duration" required 
                                                   min="30" value="${event.duration ? event.duration.match(/\d+/)?.[0] || 120 : 120}">
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <label class="form-label">Вместимость *</label>
                                            <input type="number" class="form-control" name="capacity" required 
                                                   min="1" value="${event.capacity}">
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <label class="form-label">Стоимость билета (₽) *</label>
                                            <input type="number" class="form-control" name="ticket_price" required 
                                                   min="0" step="0.01" value="${event.ticket_price}">
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="alert alert-warning">
                                    <i class="fas fa-exclamation-triangle me-2"></i>
                                    Изменения затронут существующие бронирования. Будьте осторожны при изменении даты и вместимости.
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                Отмена
                            </button>
                            <button type="button" class="btn btn-primary" onclick="updateEvent(${eventId})">
                                <i class="fas fa-save me-1"></i>Сохранить изменения
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        $('#editEventModal').remove();
        
        // Add new modal to DOM and show it
        $('body').append(modal);
        $('#editEventModal').modal('show');
        
    } catch (error) {
        showError('Не удалось загрузить данные мероприятия');
    }
}

// Update event
async function updateEvent(eventId) {
    const form = document.getElementById('editEventForm');
    const submitBtn = event.target;
    const originalText = submitBtn.innerHTML;
    
    // Get form data
    const formData = new FormData(form);
    
    try {
        // Disable submit button and show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Сохранение...';
        
        const eventData = {
            title: formData.get('title').trim(),
            description: formData.get('description').trim(),
            event_date: new Date(formData.get('event_date')).toISOString(),
            duration: parseInt(formData.get('duration')),
            capacity: parseInt(formData.get('capacity')),
            ticket_price: parseFloat(formData.get('ticket_price'))
        };
        
        // Add category if selected
        const categoryId = formData.get('category_id');
        if (categoryId) {
            eventData.category_id = parseInt(categoryId);
        }
        
        await apiRequest(`/events/${eventId}`, {
            method: 'PUT',
            body: JSON.stringify(eventData)
        });
        
        // Close modal and reload events
        $('#editEventModal').modal('hide');
        showSuccess('Мероприятие успешно обновлено');
        loadEvents();
        
    } catch (error) {
        showError(error.message || 'Не удалось обновить мероприятие');
    } finally {
        // Restore submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Delete event
async function deleteEvent(eventId) {
    if (!confirm('Вы уверены, что хотите удалить это мероприятие? Это действие нельзя отменить.')) {
        return;
    }
    
    try {
        await apiRequest(`/events/${eventId}`, {
            method: 'DELETE'
        });
        
        showSuccess('Мероприятие успешно удалено');
        loadEvents();
    } catch (error) {
        showError(error.message || 'Не удалось удалить мероприятие');
    }
}

// Show login prompt
function showLoginPrompt() {
    $('#loginModal').modal('show');
}

// Show booking modal
async function showBookingModal(eventId) {
    try {
        const [event, zones] = await Promise.all([
            apiRequest(`/events/${eventId}`),
            apiRequest('/events/zones')
        ]);
        
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
                                    <h6>Выберите зону</h6>
                                    <div class="row" id="zoneSelection">
                                        ${zones.map(zone => `
                                            <div class="col-md-4 mb-3">
                                                <div class="card zone-card ${zone.available_seats === 0 ? 'disabled' : 'selectable'}" 
                                                     onclick="${zone.available_seats > 0 ? `selectZone(${zone.zone_id}, ${eventId})` : ''}"
                                                     style="${zone.available_seats === 0 ? 'opacity: 0.5; cursor: not-allowed;' : 'cursor: pointer;'}">
                                                    <div class="card-body text-center">
                                                        <h6>${zone.name}</h6>
                                                        <p class="text-muted mb-2">${zone.description || 'Стандартная зона'}</p>
                                                        <span class="badge ${zone.available_seats === 0 ? 'bg-danger' : 'bg-primary'}">
                                                            ${zone.available_seats} мест
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <div id="seatSelection"></div>
                                </div>
                                <div class="col-lg-4">
                                    <div class="card sticky-top" style="top: 20px;">
                                        <div class="card-header">
                                            <h6 class="mb-0">Сводка бронирования</h6>
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
                                                <strong>Цена:</strong><br>
                                                <span class="text-success fs-5">${formatPrice(event.ticket_price)}</span>
                                            </div>
                                            <div class="mb-3">
                                                <strong>Выбранное место:</strong><br>
                                                <span id="selectedSeatInfo" class="text-muted">Не выбрано</span>
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

// Select zone and show seats
async function selectZone(zoneId, eventId) {
    try {
        const response = await apiRequest(`/events/${eventId}/seats?zone_id=${zoneId}`);
        
        let html = `
            <h6 class="mt-4">Выберите место</h6>
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
                     title="Место ${seat.seat_number}">
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
            $('#selectedSeatInfo').html(`<span class="text-primary">Место ${seatNumber}</span>`);
            $('#confirmBookingBtn').prop('disabled', false);
            
            // Store selected seat data
            $('#confirmBookingBtn').data('seat-id', $(this).data('seat-id'));
            $('#confirmBookingBtn').data('event-id', eventId);
        });
        
    } catch (error) {
        showError('Не удалось загрузить места');
    }
}

// Confirm booking button handler (initialize once)
$(document).on('click', '#confirmBookingBtn', async function() {
    const seatId = $(this).data('seat-id');
    const eventId = $(this).data('event-id');
    
    if (!seatId || !eventId) return;
    
    const submitBtn = $(this);
    const originalText = submitBtn.html();
    
    try {
        submitBtn.prop('disabled', true)
                 .html('<i class="fas fa-spinner fa-spin me-1"></i>Бронирование...');
        
        const booking = await apiRequest('/bookings', {
            method: 'POST',
            body: JSON.stringify({
                event_id: eventId,
                seat_id: seatId
            })
        });
        
        // Close booking modal and show payment modal
        $('#bookingModal').modal('hide');
        showPaymentModal(booking.booking_id);
        
    } catch (error) {
        showError(error.message || 'Не удалось создать бронирование');
    } finally {
        submitBtn.prop('disabled', false).html(originalText);
    }
});