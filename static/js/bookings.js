// Load my bookings page
async function loadMyBookings() {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему для просмотра бронирований');
            showLoginModal();
            return;
        }

        console.log('Loading bookings...');
        const bookings = await apiRequest('/bookings/my');
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2><i class="fas fa-ticket-alt me-2"></i>Мои бронирования</h2>
                </div>
            </div>
        `;
        
        if (!bookings || bookings.length === 0) {
            html += `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    У вас пока нет бронирований. 
                    <a href="#" onclick="navigateTo('events')">Посмотреть доступные мероприятия</a>
                </div>
            `;
        } else {
            html += `
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Мероприятие</th>
                                <th>Дата</th>
                                <th>Место</th>
                                <th>Статус</th>
                                <th>Цена</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            bookings.forEach(booking => {
                const statusBadge = getStatusBadge(booking.status);
                
                html += `
                    <tr>
                        <td>
                            <strong>${booking.event_title}</strong>
                            ${booking.zone_name ? `<br><small class="text-muted">Зона: ${booking.zone_name}</small>` : ''}
                        </td>
                        <td>${formatDate(booking.event_date)}</td>
                        <td>Место ${booking.seat_number}</td>
                        <td>${statusBadge}</td>
                        <td>${formatPrice(booking.price)}</td>
                        <td>
                            <div class="btn-group">
                                <button class="btn btn-sm btn-outline-primary" 
                                        onclick="showBookingDetails(${booking.booking_id})">
                                    <i class="fas fa-info-circle"></i>
                                </button>
                                ${booking.status === 'pending' ? `
                                    <button class="btn btn-sm btn-outline-success" 
                                            onclick="confirmBooking(${booking.booking_id})">
                                        <i class="fas fa-check"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger" 
                                            onclick="cancelBooking(${booking.booking_id})">
                                        <i class="fas fa-times"></i>
                                    </button>
                                ` : ''}
                                ${booking.status === 'confirmed' && !booking.payment_status ? `
                                    <button class="btn btn-sm btn-success" 
                                            onclick="showPaymentModal(${booking.booking_id})">
                                        <i class="fas fa-credit-card me-1"></i>Оплатить
                                    </button>
                                ` : ''}
                            </div>
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
        console.error('Failed to load bookings:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            $('#content').html(`
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Не удалось загрузить бронирования. Пожалуйста, попробуйте позже.
                    <br><small>Ошибка: ${error.message}</small>
                </div>
            `);
        }
    }
}

// Create booking
async function createBooking(eventId, seatId, zonePrice) {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему для создания бронирования');
            showLoginModal();
            return;
        }

        const response = await apiRequest('/bookings/', {
            method: 'POST',
            body: JSON.stringify({
                event_id: eventId,
                seat_id: seatId
            })
        });
        
        if (response) {
            $('#bookingModal').modal('hide');
            showSuccess('Бронирование создано успешно');
            
            // Show payment modal if price is set
            if (zonePrice > 0) {
                showPaymentModal(response.booking_id);
            } else {
                navigateTo('my-bookings');
            }
        }
    } catch (error) {
        console.error('Booking error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Не удалось создать бронирование');
        }
    }
}

// Confirm booking
async function confirmBooking(bookingId) {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему');
            showLoginModal();
            return;
        }

        await apiRequest(`/bookings/${bookingId}/confirm`, {
            method: 'POST'
        });
        
        showSuccess('Бронирование подтверждено');
        loadMyBookings();
    } catch (error) {
        console.error('Confirm booking error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Не удалось подтвердить бронирование');
        }
    }
}

// Cancel booking
async function cancelBooking(bookingId) {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему');
            showLoginModal();
            return;
        }

        await apiRequest(`/bookings/${bookingId}/cancel`, {
            method: 'POST'
        });
        
        showSuccess('Бронирование отменено');
        loadMyBookings();
    } catch (error) {
        console.error('Cancel booking error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Не удалось отменить бронирование');
        }
    }
}

// Show booking details
async function showBookingDetails(bookingId) {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему');
            showLoginModal();
            return;
        }

        const booking = await apiRequest(`/bookings/${bookingId}`);
        
        const modal = `
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
                            <div class="mb-3">
                                <h6>Мероприятие</h6>
                                <p>${booking.event_title}</p>
                            </div>
                            
                            <div class="mb-3">
                                <h6>Дата и время</h6>
                                <p>${formatDate(booking.event_date)}</p>
                            </div>
                            
                            <div class="mb-3">
                                <h6>Место</h6>
                                <p>
                                    Зона: ${booking.zone_name}<br>
                                    Место: ${booking.seat_number}
                                </p>
                            </div>
                            
                            <div class="mb-3">
                                <h6>Статус</h6>
                                <p>${getStatusBadge(booking.status)}</p>
                            </div>
                            
                            <div class="mb-3">
                                <h6>Цена</h6>
                                <p>${formatPrice(booking.price)}</p>
                            </div>
                            
                            ${booking.payment_status ? `
                                <div class="mb-3">
                                    <h6>Оплата</h6>
                                    <p>
                                        Статус: ${getPaymentStatusBadge(booking.payment_status)}<br>
                                        Метод: ${booking.payment_method || 'Не указан'}<br>
                                        Дата: ${formatDate(booking.payment_date)}
                                    </p>
                                </div>
                            ` : ''}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                Закрыть
                            </button>
                            ${booking.status === 'confirmed' && !booking.payment_status ? `
                                <button type="button" class="btn btn-success" onclick="showPaymentModal(${booking.booking_id})">
                                    <i class="fas fa-credit-card me-1"></i>Оплатить
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        $('#bookingDetailsModal').remove();
        
        // Add new modal to DOM and show it
        $('body').append(modal);
        $('#bookingDetailsModal').modal('show');
        
    } catch (error) {
        console.error('Show booking details error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Не удалось загрузить детали бронирования');
        }
    }
}

// Helper function to get status badge HTML
function getStatusBadge(status) {
    const badges = {
        'pending': '<span class="badge bg-warning">Ожидает подтверждения</span>',
        'confirmed': '<span class="badge bg-success">Подтверждено</span>',
        'cancelled': '<span class="badge bg-danger">Отменено</span>',
        'completed': '<span class="badge bg-info">Завершено</span>'
    };
    return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
}

// Helper function to get payment status badge HTML
function getPaymentStatusBadge(status) {
    const badges = {
        'pending': '<span class="badge bg-warning">Ожидает оплаты</span>',
        'completed': '<span class="badge bg-success">Оплачено</span>',
        'failed': '<span class="badge bg-danger">Ошибка оплаты</span>',
        'refunded': '<span class="badge bg-info">Возвращено</span>'
    };
    return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
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