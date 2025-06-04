// Fixed bookings.js with better error handling
// Load my bookings page
async function loadMyBookings() {
    try {
        console.log('Loading my bookings...');
        
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему для просмотра бронирований');
            showLoginModal();
            return;
        }

        // Show loading
        $('#content').html(`
            <div class="row mb-4">
                <div class="col">
                    <h2><i class="fas fa-ticket-alt me-2"></i>Мои бронирования</h2>
                </div>
            </div>
            <div class="d-flex justify-content-center align-items-center" style="min-height: 300px;">
                <div class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Загрузка...</span>
                    </div>
                    <p class="mt-3 text-muted">Загрузка ваших бронирований...</p>
                </div>
            </div>
        `);

        console.log('Fetching bookings...');
        const bookings = await apiRequest('/bookings/my');
        console.log('Bookings loaded:', bookings.length);
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2><i class="fas fa-ticket-alt me-2"></i>Мои бронирования</h2>
                </div>
            </div>
        `;
        
        if (!bookings || bookings.length === 0) {
            html += `
                <div class="alert alert-info text-center">
                    <i class="fas fa-info-circle me-2"></i>
                    У вас пока нет бронирований. 
                    <a href="#" onclick="navigateTo('events')" class="alert-link">Посмотреть доступные мероприятия</a>
                </div>
            `;
        } else {
            html += `
                <div class="card">
                    <div class="card-body">
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
                const paymentStatusBadge = booking.payment_status ? 
                    getPaymentStatusBadge(booking.payment_status) : '';
                
                html += `
                    <tr>
                        <td>
                            <strong>${booking.event_title}</strong>
                            ${booking.zone_name ? `<br><small class="text-muted">Зона: ${booking.zone_name}</small>` : ''}
                        </td>
                        <td>
                            <small>${formatDate(booking.event_date)}</small>
                        </td>
                        <td>
                            <span class="badge bg-light text-dark">Место ${booking.seat_number}</span>
                        </td>
                        <td>
                            ${statusBadge}
                            ${paymentStatusBadge ? `<br>${paymentStatusBadge}` : ''}
                        </td>
                        <td>
                            <strong class="text-success">${formatPrice(booking.price || 0)}</strong>
                        </td>
                        <td>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary" 
                                        onclick="showBookingDetails(${booking.booking_id})"
                                        title="Подробности">
                                    <i class="fas fa-info-circle"></i>
                                </button>
                                ${booking.status === 'pending' ? `
                                    <button class="btn btn-outline-success" 
                                            onclick="confirmBooking(${booking.booking_id})"
                                            title="Подтвердить">
                                        <i class="fas fa-check"></i>
                                    </button>
                                    <button class="btn btn-outline-danger" 
                                            onclick="cancelBooking(${booking.booking_id})"
                                            title="Отменить">
                                        <i class="fas fa-times"></i>
                                    </button>
                                ` : ''}
                                ${booking.status === 'confirmed' && (!booking.payment_status || booking.payment_status === 'pending') ? `
                                    <button class="btn btn-success btn-sm" 
                                            onclick="showPaymentModal(${booking.booking_id})"
                                            title="Оплатить">
                                        <i class="fas fa-credit-card"></i>
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
            </div>
        </div>
            `;
        }
        
        $('#content').html(html);
        console.log('My bookings page loaded successfully');
        
    } catch (error) {
        console.error('Failed to load bookings:', error);
        
        let errorHtml = `
            <div class="row mb-4">
                <div class="col">
                    <h2><i class="fas fa-ticket-alt me-2"></i>Мои бронирования</h2>
                </div>
            </div>
        `;
        
        if (error.message === 'Unauthorized') {
            errorHtml += `
                <div class="alert alert-warning text-center">
                    <i class="fas fa-lock fa-3x mb-3"></i>
                    <h4>Требуется авторизация</h4>
                    <p>Для просмотра бронирований необходимо войти в систему.</p>
                    <button class="btn btn-primary" onclick="showLoginModal()">
                        <i class="fas fa-sign-in-alt me-1"></i>Войти
                    </button>
                </div>
            `;
        } else {
            errorHtml += `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>Ошибка загрузки бронирований</strong>
                    <p class="mb-2">Не удалось загрузить ваши бронирования.</p>
                    <details>
                        <summary>Подробности ошибки</summary>
                        <pre class="mt-2">${error.message}</pre>
                    </details>
                    <button class="btn btn-primary mt-2" onclick="loadMyBookings()">
                        <i class="fas fa-redo me-1"></i>Попробовать снова
                    </button>
                </div>
            `;
        }
        
        $('#content').html(errorHtml);
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
    if (!confirm('Вы уверены, что хотите отменить это бронирование?')) {
        return;
    }
    
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
                                <i class="fas fa-ticket-alt me-2"></i>Детали бронирования #${booking.booking_id}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-8">
                                    <div class="mb-3">
                                        <h6>Мероприятие</h6>
                                        <p><strong>${booking.event_title}</strong></p>
                                        ${booking.event_description ? `<p class="text-muted">${booking.event_description}</p>` : ''}
                                    </div>
                                    
                                    <div class="mb-3">
                                        <h6>Дата и время</h6>
                                        <p>${formatDate(booking.event_date)}</p>
                                    </div>
                                    
                                    <div class="mb-3">
                                        <h6>Место</h6>
                                        <p>
                                            <strong>Зона:</strong> ${booking.zone_name}<br>
                                            <strong>Место:</strong> ${booking.seat_number}
                                        </p>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6 class="mb-0">Статус и оплата</h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="mb-3">
                                                <strong>Статус бронирования:</strong><br>
                                                ${getStatusBadge(booking.status)}
                                            </div>
                                            
                                            <div class="mb-3">
                                                <strong>Цена:</strong><br>
                                                <span class="fs-5 text-success">${formatPrice(booking.price || 0)}</span>
                                            </div>
                                            
                                            ${booking.payment_status ? `
                                                <div class="mb-3">
                                                    <strong>Статус оплаты:</strong><br>
                                                    ${getPaymentStatusBadge(booking.payment_status)}
                                                </div>
                                                ${booking.payment_method ? `
                                                    <div class="mb-3">
                                                        <strong>Способ оплаты:</strong><br>
                                                        ${translatePaymentMethod(booking.payment_method)}
                                                    </div>
                                                ` : ''}
                                                ${booking.payment_date ? `
                                                    <div class="mb-3">
                                                        <strong>Дата оплаты:</strong><br>
                                                        ${formatDate(booking.payment_date)}
                                                    </div>
                                                ` : ''}
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            ${booking.status === 'confirmed' && (!booking.payment_status || booking.payment_status === 'pending') ? `
                                <button type="button" class="btn btn-success" onclick="$('#bookingDetailsModal').modal('hide'); showPaymentModal(${booking.booking_id})">
                                    <i class="fas fa-credit-card me-1"></i>Оплатить
                                </button>
                            ` : ''}
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                Закрыть
                            </button>
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

// Show payment modal
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
    $('body').append(modal);
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
            
            // Refresh bookings
            loadMyBookings();
            
        } catch (error) {
            showError(error.message || 'Ошибка обработки платежа');
        } finally {
            // Restore button state
            submitBtn.prop('disabled', false).html(originalText);
        }
    });
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

// Make functions globally available
window.loadMyBookings = loadMyBookings;
window.createBooking = createBooking;
window.confirmBooking = confirmBooking;
window.cancelBooking = cancelBooking;
window.showBookingDetails = showBookingDetails;
window.showPaymentModal = showPaymentModal;
window.getStatusBadge = getStatusBadge;
window.getPaymentStatusBadge = getPaymentStatusBadge;
window.translatePaymentMethod = translatePaymentMethod;