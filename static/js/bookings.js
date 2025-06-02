// Load my bookings page
async function loadMyBookings() {
    try {
        const bookings = await apiRequest('/bookings/my-bookings');
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2>Мои бронирования</h2>
                </div>
            </div>
        `;
        
        if (bookings.length === 0) {
            html += `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    У вас пока нет бронирований.
                    <a href="#" onclick="navigateTo('events')" class="alert-link">Просмотреть мероприятия</a>
                </div>
            `;
        } else {
            html += `
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Мероприятие</th>
                                <th>Дата</th>
                                <th>Место</th>
                                <th>Цена</th>
                                <th>Статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            bookings.forEach(booking => {
                const isPastEvent = new Date(booking.event_date) < new Date();
                
                html += `
                    <tr>
                        <td>
                            <strong>${booking.event_title}</strong>
                        </td>
                        <td>
                            <small>${formatDate(booking.event_date)}</small>
                        </td>
                        <td>
                            <span class="badge bg-info">${booking.zone_name}</span><br>
                            <small>Место ${booking.seat_number}</small>
                        </td>
                        <td>
                            <strong>${formatPrice(booking.ticket_price)}</strong>
                        </td>
                        <td>
                            <span class="badge bg-${getStatusBadgeColor(booking.status)}">
                                ${translateStatus(booking.status)}
                            </span>
                            ${booking.payment_status ? `
                                <br><small class="text-muted">${translatePaymentStatus(booking.payment_status)}</small>
                            ` : ''}
                        </td>
                        <td>
                            ${booking.status === 'pending' ? `
                                <button class="btn btn-sm btn-primary mb-1" 
                                        onclick="showPaymentModal(${booking.booking_id})">
                                    <i class="fas fa-credit-card me-1"></i>Оплатить
                                </button><br>
                            ` : ''}
                            ${!isPastEvent && booking.status !== 'cancelled' ? `
                                <button class="btn btn-sm btn-danger mb-1" 
                                        onclick="cancelBooking(${booking.booking_id})">
                                    <i class="fas fa-times me-1"></i>Отменить
                                </button><br>
                            ` : ''}
                            <button class="btn btn-sm btn-info" 
                                    onclick="showBookingDetails(${booking.booking_id})">
                                <i class="fas fa-eye me-1"></i>Детали
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        $('#content').html(html);
    } catch (error) {
        $('#content').html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Произошла ошибка при загрузке бронирований. Пожалуйста, попробуйте позже.
            </div>
        `);
    }
}

// Get status badge color
function getStatusBadgeColor(status) {
    switch (status) {
        case 'confirmed':
            return 'success';
        case 'pending':
            return 'warning';
        case 'cancelled':
            return 'danger';
        default:
            return 'secondary';
    }
}

// Translate booking status
function translateStatus(status) {
    switch (status) {
        case 'confirmed':
            return 'Подтверждено';
        case 'pending':
            return 'Ожидает оплаты';
        case 'cancelled':
            return 'Отменено';
        default:
            return status;
    }
}

// Translate payment status
function translatePaymentStatus(status) {
    switch (status) {
        case 'completed':
            return 'Оплачено';
        case 'pending':
            return 'Ожидает оплаты';
        case 'failed':
            return 'Ошибка оплаты';
        case 'refunded':
            return 'Возвращено';
        default:
            return status;
    }
}

// Translate payment method
function translatePaymentMethod(method) {
    switch (method) {
        case 'credit_card':
            return 'Кредитная карта';
        case 'debit_card':
            return 'Дебетовая карта';
        case 'paypal':
            return 'PayPal';
        case 'apple_pay':
            return 'Apple Pay';
        case 'google_pay':
            return 'Google Pay';
        default:
            return method;
    }
}

// Cancel booking
async function cancelBooking(bookingId) {
    if (!confirm('Вы уверены, что хотите отменить это бронирование?')) {
        return;
    }
    
    try {
        await apiRequest(`/bookings/${bookingId}`, {
            method: 'DELETE'
        });
        
        showSuccess('Бронирование успешно отменено');
        loadMyBookings();
    } catch (error) {
        // Error is handled by apiRequest
    }
}

// Show booking details
async function showBookingDetails(bookingId) {
    try {
        const booking = await apiRequest(`/bookings/${bookingId}`);
        
        const html = `
            <div class="modal fade" id="bookingDetailsModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-ticket-alt me-2"></i>Детали бронирования
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="card">
                                <div class="card-body">
                                    <h6 class="card-subtitle mb-2 text-muted">
                                        <i class="fas fa-calendar-alt me-1"></i>Информация о мероприятии
                                    </h6>
                                    <p class="mb-1"><strong>Мероприятие:</strong> ${booking.event_title}</p>
                                    <p class="mb-1"><strong>Дата:</strong> ${formatDate(booking.event_date)}</p>
                                    ${booking.description ? `
                                        <p class="mb-1"><strong>Описание:</strong> ${booking.description}</p>
                                    ` : ''}
                                    ${booking.duration ? `
                                        <p class="mb-1"><strong>Продолжительность:</strong> ${booking.duration}</p>
                                    ` : ''}
                                    <hr>
                                    <h6 class="card-subtitle mb-2 text-muted">
                                        <i class="fas fa-chair me-1"></i>Информация о месте
                                    </h6>
                                    <p class="mb-1"><strong>Зона:</strong> ${booking.zone_name}</p>
                                    <p class="mb-1"><strong>Место:</strong> ${booking.seat_number}</p>
                                    <hr>
                                    <h6 class="card-subtitle mb-2 text-muted">
                                        <i class="fas fa-receipt me-1"></i>Информация о бронировании
                                    </h6>
                                    <p class="mb-1"><strong>Дата бронирования:</strong> ${formatDate(booking.booking_date)}</p>
                                    <p class="mb-1"><strong>Статус:</strong> 
                                        <span class="badge bg-${getStatusBadgeColor(booking.status)}">
                                            ${translateStatus(booking.status)}
                                        </span>
                                    </p>
                                    <p class="mb-1"><strong>Цена:</strong> ${formatPrice(booking.ticket_price)}</p>
                                    ${booking.payment_status ? `
                                        <hr>
                                        <h6 class="card-subtitle mb-2 text-muted">
                                            <i class="fas fa-credit-card me-1"></i>Информация об оплате
                                        </h6>
                                        <p class="mb-1"><strong>Статус оплаты:</strong> 
                                            <span class="badge bg-${getPaymentStatusBadgeColor(booking.payment_status)}">
                                                ${translatePaymentStatus(booking.payment_status)}
                                            </span>
                                        </p>
                                        ${booking.payment_method ? `
                                            <p class="mb-1"><strong>Способ оплаты:</strong> ${translatePaymentMethod(booking.payment_method)}</p>
                                        ` : ''}
                                        ${booking.transaction_date ? `
                                            <p class="mb-1"><strong>Дата оплаты:</strong> ${formatDate(booking.transaction_date)}</p>
                                        ` : ''}
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            ${booking.status === 'pending' ? `
                                <button type="button" class="btn btn-primary" onclick="$('#bookingDetailsModal').modal('hide'); showPaymentModal(${booking.booking_id})">
                                    <i class="fas fa-credit-card me-1"></i>Оплатить сейчас
                                </button>
                            ` : ''}
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        $('#bookingDetailsModal').remove();
        
        // Add new modal to DOM and show it
        $('body').append(html);
        $('#bookingDetailsModal').modal('show');
    } catch (error) {
        // Error is handled by apiRequest
    }
}

// Get payment status badge color
function getPaymentStatusBadgeColor(status) {
    switch (status) {
        case 'completed':
            return 'success';
        case 'pending':
            return 'warning';
        case 'failed':
            return 'danger';
        case 'refunded':
            return 'info';
        default:
            return 'secondary';
    }
}

// Show payment modal (this function is also used from events.js)
function showPaymentModal(bookingId) {
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
                                <label class="form-label">
                                    <i class="fas fa-credit-card me-1"></i>Способ оплаты
                                </label>
                                <select class="form-select" name="payment_method" required>
                                    <option value="">Выберите способ оплаты</option>
                                    <option value="credit_card">💳 Кредитная карта</option>
                                    <option value="debit_card">💳 Дебетовая карта</option>
                                    <option value="paypal">🅿️ PayPal</option>
                                    <option value="apple_pay">🍎 Apple Pay</option>
                                    <option value="google_pay">🇬 Google Pay</option>
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
        
        const submitBtn = $(this).find('button[type="submit"]');
        const originalText = submitBtn.html();
        
        // Show loading state
        submitBtn.prop('disabled', true)
                 .html('<i class="fas fa-spinner fa-spin me-1"></i>Обработка...');
        
        try {
            await apiRequest('/bookings/pay', {
                method: 'POST',
                body: JSON.stringify({
                    booking_id: bookingId,
                    payment_method: this.payment_method.value
                })
            });
            
            $('#paymentModal').modal('hide');
            showSuccess('Платеж успешно обработан! Ваше бронирование подтверждено.');
            
            // Refresh bookings if we're on the bookings page
            if (window.location.pathname.includes('my-bookings')) {
                loadMyBookings();
            } else {
                navigateTo('my-bookings');
            }
        } catch (error) {
            // Error is handled by apiRequest
        } finally {
            // Restore button state
            submitBtn.prop('disabled', false).html(originalText);
        }
    });
}