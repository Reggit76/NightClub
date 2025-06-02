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
                const availableSeats = event.capacity - event.booked_seats;
                html += `
                    <div class="col-md-4">
                        <div class="card event-card">
                            <div class="card-body">
                                <h5 class="card-title">${event.title}</h5>
                                <p class="card-text">${event.description}</p>
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
                                    <button class="btn btn-primary" onclick="showBookingModal(${event.event_id})">
                                        Забронировать
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
                                        <input type="number" class="form-control" name="duration" required min="30">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Вместимость</label>
                                        <input type="number" class="form-control" name="capacity" required min="1">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Цена билета</label>
                                        <input type="number" class="form-control" name="ticket_price" required min="0" step="0.01">
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
                showSuccess('Event updated successfully');
            } else {
                await apiRequest('/events', {
                    method: 'POST',
                    body: JSON.stringify(formData)
                });
                showSuccess('Event created successfully');
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
function showCreateEventModal() {
    const modal = $('#eventModal');
    modal.find('.modal-title').text('Create Event');
    modal.find('form')[0].reset();
    modal.find('[name="event_id"]').val('');
    modal.modal('show');
}

// Show edit event modal
async function showEditEventModal(eventId) {
    try {
        const event = await apiRequest(`/events/${eventId}`);
        
        const modal = $('#eventModal');
        modal.find('.modal-title').text('Edit Event');
        
        const form = modal.find('form')[0];
        form.event_id.value = eventId;
        form.title.value = event.title;
        form.description.value = event.description;
        form.event_date.value = new Date(event.event_date).toISOString().slice(0, 16);
        form.duration.value = event.duration.minutes || 60;
        form.capacity.value = event.capacity;
        form.ticket_price.value = event.ticket_price;
        
        modal.modal('show');
    } catch (error) {
        // Error is handled by apiRequest
    }
}

// Delete event
async function deleteEvent(eventId) {
    if (!confirm('Are you sure you want to delete this event?')) {
        return;
    }
    
    try {
        await apiRequest(`/events/${eventId}`, {
            method: 'DELETE'
        });
        
        showSuccess('Event deleted successfully');
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
                            <h5 class="modal-title">Book Tickets - ${event.title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-8">
                                    <h6>Select Zone</h6>
                                    <div class="list-group mb-3">
                                        ${event.zones.map(zone => `
                                            <button type="button" class="list-group-item list-group-item-action"
                                                    onclick="selectZone(${zone.zone_id}, ${event.event_id})">
                                                ${zone.zone_name}
                                                <span class="badge bg-primary float-end">
                                                    ${zone.available_seats} seats available
                                                </span>
                                            </button>
                                        `).join('')}
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card">
                                        <div class="card-body">
                                            <h6>Booking Summary</h6>
                                            <p class="mb-1">Date: ${formatDate(event.event_date)}</p>
                                            <p class="mb-1">Price: ${formatPrice(event.ticket_price)}</p>
                                            <button class="btn btn-primary w-100 mt-3" id="confirmBookingBtn" disabled>
                                                Confirm Booking
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
        
        const seatsContainer = $('<div class="seat-map mt-3"></div>');
        seatsContainer.css('grid-template-columns', `repeat(${Math.ceil(Math.sqrt(response.seats.length))}, 1fr)`);
        
        response.seats.forEach(seat => {
            const seatElement = $(`
                <div class="seat ${seat.is_booked ? 'booked' : 'available'}"
                     data-seat-id="${seat.seat_id}">
                    ${seat.seat_number}
                </div>
            `);
            
            if (!seat.is_booked) {
                seatElement.click(function() {
                    $('.seat').removeClass('selected');
                    $(this).addClass('selected');
                    $('#confirmBookingBtn').prop('disabled', false);
                });
            }
            
            seatsContainer.append(seatElement);
        });
        
        $('.seat-map').remove();
        $('.list-group').after(seatsContainer);
        
        // Update confirm booking button handler
        $('#confirmBookingBtn').off('click').on('click', async function() {
            const selectedSeat = $('.seat.selected');
            if (selectedSeat.length === 0) return;
            
            try {
                const booking = await apiRequest('/bookings', {
                    method: 'POST',
                    body: JSON.stringify({
                        event_id: eventId,
                        seat_id: selectedSeat.data('seat-id')
                    })
                });
                
                // Show payment modal
                showPaymentModal(booking.booking_id);
            } catch (error) {
                // Error is handled by apiRequest
            }
        });
    } catch (error) {
        // Error is handled by apiRequest
    }
}

// Show payment modal
function showPaymentModal(bookingId) {
    $('#bookingModal').modal('hide');
    
    const html = `
        <div class="modal fade" id="paymentModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Payment Simulation</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="paymentForm">
                            <div class="mb-3">
                                <label class="form-label">Payment Method</label>
                                <select class="form-select" name="payment_method" required>
                                    <option value="credit_card">Credit Card</option>
                                    <option value="debit_card">Debit Card</option>
                                    <option value="paypal">PayPal</option>
                                </select>
                            </div>
                            <button type="submit" class="btn btn-primary">Process Payment</button>
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
            showSuccess('Booking confirmed successfully');
            navigateTo('my-bookings');
        } catch (error) {
            // Error is handled by apiRequest
        }
    });
} 