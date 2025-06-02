// Load events page
async function loadEvents() {
    try {
        let events = [];
        try {
            events = await apiRequest('/events');
        } catch (error) {
            if (error.message.includes('404')) {
                events = [];
            } else {
                throw error;
            }
        }
        
        // Check if user has admin or moderator role
        const isAdminOrModerator = currentUser && currentUser.role && ['admin', 'moderator'].includes(currentUser.role);
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2>Мероприятия</h2>
                </div>
                ${isAdminOrModerator ? `
                    <div class="col-auto">
                        <button class="btn btn-primary" onclick="showCreateEventModal()">
                            <i class="fas fa-plus"></i> Создать мероприятие
                        </button>
                    </div>
                ` : ''}
            </div>
            <div class="row">
                ${events.map(event => `
                    <div class="col-md-4 mb-4">
                        <div class="event-card">
                            <h4>${event.title}</h4>
                            <p class="text-muted">${formatDate(event.event_date)}</p>
                            <p>${event.description}</p>
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="badge bg-primary">${event.category_name || 'Без категории'}</span>
                                <span class="text-muted">${formatPrice(event.ticket_price)}</span>
                            </div>
                            <div class="mt-3">
                                <div class="progress mb-2">
                                    <div class="progress-bar" role="progressbar" 
                                         style="width: ${(event.booked_seats / event.capacity * 100)}%">
                                    </div>
                                </div>
                                <small class="text-muted">
                                    ${event.booked_seats} из ${event.capacity} мест забронировано
                                </small>
                            </div>
                            ${currentUser ? `
                                <button class="btn btn-primary mt-3 w-100" onclick="bookEvent(${event.event_id})">
                                    Забронировать
                                </button>
                            ` : `
                                <button class="btn btn-primary mt-3 w-100" onclick="showLoginPrompt()">
                                    Войдите для бронирования
                                </button>
                            `}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        if (events.length === 0) {
            html = `
                <div class="alert alert-info">
                    Нет доступных мероприятий
                </div>
            `;
        }
        
        $('#content').html(html);
    } catch (error) {
        showError('Не удалось загрузить мероприятия');
    }
}

// Show create event modal
function showCreateEventModal() {
    const modal = `
        <div class="modal fade" id="createEventModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Создание мероприятия</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="createEventForm" class="event-form" onsubmit="createEvent(event)">
                            <div class="mb-3">
                                <label class="form-label">Название</label>
                                <input type="text" class="form-control" name="title" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Описание</label>
                                <textarea class="form-control" name="description" rows="3" required></textarea>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Дата и время</label>
                                <input type="datetime-local" class="form-control" name="event_date" required>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Длительность (минуты)</label>
                                    <input type="number" class="form-control" name="duration" required min="30">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Вместимость</label>
                                    <input type="number" class="form-control" name="capacity" required min="1">
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Стоимость билета</label>
                                <input type="number" class="form-control" name="ticket_price" required min="0" step="0.01">
                            </div>
                            <button type="submit" class="btn btn-primary">Создать</button>
                        </form>
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
}

// Create event
async function createEvent(event) {
    event.preventDefault();
    
    const form = document.getElementById('createEventForm');
    const formData = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    try {
        // Disable submit button and show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Создание...';
        
        // Check if user has permission
        if (!currentUser || !currentUser.role || !['admin', 'moderator'].includes(currentUser.role)) {
            throw new Error('У вас нет прав для создания мероприятий');
        }
        
        const response = await apiRequest('/events', {
            method: 'POST',
            body: JSON.stringify({
                title: formData.get('title'),
                description: formData.get('description'),
                event_date: formData.get('event_date'),
                duration: parseInt(formData.get('duration')),
                capacity: parseInt(formData.get('capacity')),
                ticket_price: parseFloat(formData.get('ticket_price'))
            })
        });
        
        // Close modal and reload events
        $('#createEventModal').modal('hide');
        showSuccess('Мероприятие успешно создано');
        loadEvents();
    } catch (error) {
        showError(error.message || 'Не удалось создать мероприятие');
    } finally {
        // Restore submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Book event
async function bookEvent(eventId) {
    try {
        await apiRequest(`/bookings/book/${eventId}`, {
            method: 'POST'
        });
        showSuccess('Бронирование успешно создано');
        loadEvents();
    } catch (error) {
        showError('Не удалось забронировать мероприятие');
    }
}

// Show login prompt
function showLoginPrompt() {
    $('#loginModal').modal('show');
}

// Event form handler
function initEventFormHandler() {
    $('#eventForm').submit(async function(e) {
        e.preventDefault();
        
        const eventId = this.event_id.value;
        const formData = {
            category_id: this.category_id.value ? parseInt(this.category_id.value) : null,
            title: this.title.value,
            description: this.description.value,
            event_date: new Date(this.event_date.value).toISOString(),
            duration: parseInt(this.duration.value),
            capacity: parseInt(this.capacity.value),
            ticket_price: parseFloat(this.ticket_price.value)
        };
        
        try {
            if (eventId) {
                await apiRequest(`/events/${eventId}`, {
                    method: 'PUT',
                    body: JSON.stringify(formData)
                });
                showSuccess('Мероприятие успешно обновлено');
            } else {
                await apiRequest('/events', {
                    method: 'POST',
                    body: JSON.stringify(formData)
                });
                showSuccess('Мероприятие успешно создано');
            }
            
            $('#eventModal').modal('hide');
            this.reset();
            loadEvents();
        } catch (error) {
            // Error is handled by apiRequest
        }
    });
}

// Show edit event modal
async function showEditEventModal(eventId) {
    try {
        const event = await apiRequest(`/events/${eventId}`);
        
        const modal = $('#eventModal');
        modal.find('.modal-title').text('Редактировать мероприятие');
        
        const form = modal.find('form')[0];
        form.event_id.value = eventId;
        form.category_id.value = event.category_id || '';
        form.title.value = event.title;
        form.description.value = event.description;
        form.event_date.value = new Date(event.event_date).toISOString().slice(0, 16);
        
        // Parse duration from interval format
        const durationMatch = event.duration?.match(/(\d+)/);
        form.duration.value = durationMatch ? durationMatch[1] : 120;
        
        form.capacity.value = event.capacity;
        form.ticket_price.value = event.ticket_price;
        
        modal.modal('show');
    } catch (error) {
        // Error is handled by apiRequest
    }
}

// Delete event
async function deleteEvent(eventId) {
    if (!confirm('Вы уверены, что хотите удалить это мероприятие?')) {
        return;
    }
    
    try {
        await apiRequest(`/events/${eventId}`, {
            method: 'DELETE'
        });
        
        showSuccess('Мероприятие успешно удалено');
        loadEvents();
    } catch (error) {
        // Error is handled by apiRequest
    }
}

// Show booking modal
async function showBookingModal(eventId) {
    try {
        const event = await apiRequest(`/events/${eventId}`);
        
        let html = `
            <div class="modal fade" id="bookingModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Бронирование билетов - ${event.title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-8">
                                    <h6>Выберите зону</h6>
                                    <div class="list-group mb-3">
                                        ${event.zones.map(zone => `
                                            <button type="button" class="list-group-item list-group-item-action ${zone.available_seats === 0 ? 'disabled' : ''}"
                                                    onclick="selectZone(${zone.zone_id}, ${event.event_id})"
                                                    ${zone.available_seats === 0 ? 'disabled' : ''}>
                                                ${zone.zone_name}
                                                <span class="badge ${zone.available_seats === 0 ? 'bg-danger' : 'bg-primary'} float-end">
                                                    ${zone.available_seats} мест свободно
                                                </span>
                                            </button>
                                        `).join('')}
                                    </div>
                                    <div id="seatSelection"></div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card">
                                        <div class="card-body">
                                            <h6>Сводка бронирования</h6>
                                            <p class="mb-1"><strong>Дата:</strong> ${formatDate(event.event_date)}</p>
                                            <p class="mb-1"><strong>Цена:</strong> ${formatPrice(event.ticket_price)}</p>
                                            <p class="mb-3"><strong>Выбранное место:</strong> <span id="selectedSeatInfo">Не выбрано</span></p>
                                            <button class="btn btn-primary w-100 mt-3" id="confirmBookingBtn" disabled>
                                                Подтвердить бронирование
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
        // Error is handled by apiRequest
    }
}

// Select zone and show seats
async function selectZone(zoneId, eventId) {
    try {
        const response = await apiRequest(`/events/${eventId}/seats?zone_id=${zoneId}`);
        
        let html = `
            <h6 class="mt-3">Выберите место</h6>
            <div class="seat-legend mb-3">
                <small class="text-muted">
                    <span class="badge bg-secondary me-2">Свободно</span>
                    <span class="badge bg-success me-2">Выбрано</span>
                    <span class="badge bg-danger">Занято</span>
                </small>
            </div>
            <div class="seat-map">
        `;
        
        response.seats.forEach(seat => {
            html += `
                <div class="seat ${seat.is_booked ? 'booked' : 'available'}"
                     data-seat-id="${seat.seat_id}"
                     data-seat-number="${seat.seat_number}">
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
            $('#selectedSeatInfo').text(`Место ${seatNumber}`);
            $('#confirmBookingBtn').prop('disabled', false);
            
            // Store selected seat data
            $('#confirmBookingBtn').data('seat-id', $(this).data('seat-id'));
            $('#confirmBookingBtn').data('event-id', eventId);
        });
        
    } catch (error) {
        // Error is handled by apiRequest
    }
}

// Confirm booking button handler (initialize once)
$(document).on('click', '#confirmBookingBtn', async function() {
    const seatId = $(this).data('seat-id');
    const eventId = $(this).data('event-id');
    
    if (!seatId || !eventId) return;
    
    try {
        const booking = await apiRequest('/bookings', {
            method: 'POST',
            body: JSON.stringify({
                event_id: eventId,
                seat_id: seatId
            })
        });
        
        // Show payment modal
        showPaymentModal(booking.booking_id);
    } catch (error) {
        // Error is handled by apiRequest
    }
});

// Show payment modal
function showPaymentModal(bookingId) {
    $('#bookingModal').modal('hide');
    
    const html = `
        <div class="modal fade" id="paymentModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-credit-card me-2"></i>Симуляция оплаты
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            Это демонстрационная система. Реальные платежи не осуществляются.
                        </div>
                        <form id="paymentForm">
                            <div class="mb-3">
                                <label class="form-label">Способ оплаты</label>
                                <select class="form-select" name="payment_method" required>
                                    <option value="credit_card">Кредитная карта</option>
                                    <option value="debit_card">Дебетовая карта</option>
                                    <option value="paypal">PayPal</option>
                                    <option value="apple_pay">Apple Pay</option>
                                    <option value="google_pay">Google Pay</option>
                                </select>
                            </div>
                            <button type="submit" class="btn btn-success w-100">
                                <i class="fas fa-check me-1"></i>Обработать платеж
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    $('#paymentModal').remove();
    
    // Add new modal to DOM and show it
    $('body').append(html);
    $('#paymentModal').modal('show');
    
    // Payment form handler
    $('#paymentForm').submit(async function(e) {
        e.preventDefault();
        
        try {
            await apiRequest('/bookings/pay', {
                method: 'POST',
                body: JSON.stringify({
                    booking_id: bookingId,
                    payment_method: this.payment_method.value
                })
            });
            
            $('#paymentModal').modal('hide');
            showSuccess('Бронирование успешно подтверждено!');
            navigateTo('my-bookings');
        } catch (error) {
            // Error is handled by apiRequest
        }
    });
}