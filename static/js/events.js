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
        
        const isAdminOrModerator = currentUser && ['admin', 'moderator'].includes(currentUser.role);
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2>Предстоящие мероприятия</h2>
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
        `;
        
        if (events.length === 0) {
            html += `
                <div class="col">
                    <div class="alert alert-info">
                        ${isAdminOrModerator ? 
                            'Нет предстоящих мероприятий. Нажмите "Создать мероприятие", чтобы добавить новое.' :
                            'В данный момент нет предстоящих мероприятий. Пожалуйста, проверьте позже.'}
                    </div>
                </div>
            `;
        } else {
            events.forEach(event => {
                const availableSeats = event.capacity - (event.booked_seats || 0);
                html += `
                    <div class="col-md-4">
                        <div class="card event-card">
                            <div class="card-body">
                                <h5 class="card-title">${event.title}</h5>
                                <p class="card-text">${event.description}</p>
                                ${event.category_name ? `
                                    <div class="mb-2">
                                        <small class="text-muted">
                                            <i class="fas fa-folder"></i> ${event.category_name}
                                        </small>
                                    </div>
                                ` : ''}
                                <div class="mb-2">
                                    <small class="text-muted">
                                        <i class="fas fa-calendar"></i> ${formatDate(event.event_date)}
                                    </small>
                                </div>
                                <div class="mb-2">
                                    <small class="text-muted">
                                        <i class="fas fa-tag"></i> ${formatPrice(event.ticket_price)}
                                    </small>
                                </div>
                                <div class="mb-3">
                                    <small class="text-muted">
                                        <i class="fas fa-chair"></i> ${availableSeats} мест свободно
                                    </small>
                                </div>
                                ${currentUser ? `
                                    <button class="btn btn-primary" onclick="showBookingModal(${event.event_id})"
                                            ${availableSeats === 0 ? 'disabled' : ''}>
                                        ${availableSeats === 0 ? 'Распродано' : 'Забронировать'}
                                    </button>
                                ` : `
                                    <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#loginModal">
                                        Войдите для бронирования
                                    </button>
                                `}
                                ${isAdminOrModerator ? `
                                    <button class="btn btn-outline-primary ms-2" onclick="showEditEventModal(${event.event_id})">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-outline-danger ms-2" onclick="deleteEvent(${event.event_id})">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        
        // Add event creation modal for admin/moderator
        if (isAdminOrModerator) {
            // Get categories for the form
            let categories = [];
            try {
                categories = await apiRequest('/events/categories');
            } catch (error) {
                console.warn('Failed to load categories:', error);
            }
            
            html += `
                <div class="modal fade" id="eventModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Создать мероприятие</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <form id="eventForm">
                                    <input type="hidden" name="event_id">
                                    <div class="mb-3">
                                        <label class="form-label">Категория</label>
                                        <select class="form-select" name="category_id">
                                            <option value="">Без категории</option>
                                            ${categories.map(cat => `
                                                <option value="${cat.category_id}">${cat.name}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Название</label>
                                        <input type="text" class="form-control" name="title" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Описание</label>
                                        <textarea class="form-control" name="description" required></textarea>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Дата и время</label>
                                        <input type="datetime-local" class="form-control" name="event_date" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Продолжительность (минут)</label>
                                        <input type="number" class="form-control" name="duration" required min="30" value="120">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Вместимость</label>
                                        <input type="number" class="form-control" name="capacity" required min="1" value="100">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Цена билета (₽)</label>
                                        <input type="number" class="form-control" name="ticket_price" required min="0" step="0.01" value="1000">
                                    </div>
                                    <button type="submit" class="btn btn-primary">Сохранить</button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        $('#content').html(html);
        
        // Initialize event form handler
        if (isAdminOrModerator) {
            initEventFormHandler();
        }
    } catch (error) {
        $('#content').html(`
            <div class="alert alert-danger">
                Произошла ошибка при загрузке мероприятий. Пожалуйста, попробуйте позже.
            </div>
        `);
    }
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

// Show create event modal
async function showCreateEventModal() {
    const modal = $('#eventModal');
    modal.find('.modal-title').text('Создать мероприятие');
    modal.find('form')[0].reset();
    modal.find('[name="event_id"]').val('');
    
    // Set default values
    const now = new Date();
    now.setHours(now.getHours() + 1);
    modal.find('[name="event_date"]').val(now.toISOString().slice(0, 16));
    modal.find('[name="duration"]').val('120');
    modal.find('[name="capacity"]').val('100');
    modal.find('[name="ticket_price"]').val('1000');
    
    modal.modal('show');
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