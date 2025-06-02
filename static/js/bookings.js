// Load my bookings page
async function loadMyBookings() {
    try {
        const bookings = await apiRequest('/bookings/my-bookings');
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2>My Bookings</h2>
                </div>
            </div>
        `;
        
        if (bookings.length === 0) {
            html += `
                <div class="alert alert-info">
                    You don't have any bookings yet.
                    <a href="#" onclick="navigateTo('events')">Browse events</a>
                </div>
            `;
        } else {
            html += `
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Event</th>
                                <th>Date</th>
                                <th>Seat</th>
                                <th>Price</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            bookings.forEach(booking => {
                const isPastEvent = new Date(booking.event_date) < new Date();
                
                html += `
                    <tr>
                        <td>${booking.event_title}</td>
                        <td>${formatDate(booking.event_date)}</td>
                        <td>${booking.zone_name} - ${booking.seat_number}</td>
                        <td>${formatPrice(booking.ticket_price)}</td>
                        <td>
                            <span class="badge bg-${getStatusBadgeColor(booking.status)}">
                                ${booking.status}
                            </span>
                        </td>
                        <td>
                            ${booking.status === 'pending' ? `
                                <button class="btn btn-sm btn-primary" 
                                        onclick="showPaymentModal(${booking.booking_id})">
                                    Pay Now
                                </button>
                            ` : ''}
                            ${!isPastEvent && booking.status !== 'cancelled' ? `
                                <button class="btn btn-sm btn-danger" 
                                        onclick="cancelBooking(${booking.booking_id})">
                                    Cancel
                                </button>
                            ` : ''}
                            <button class="btn btn-sm btn-info" 
                                    onclick="showBookingDetails(${booking.booking_id})">
                                Details
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
        // Error is handled by apiRequest
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

// Cancel booking
async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking?')) {
        return;
    }
    
    try {
        await apiRequest(`/bookings/${bookingId}`, {
            method: 'DELETE'
        });
        
        showSuccess('Booking cancelled successfully');
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
                            <h5 class="modal-title">Booking Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="card">
                                <div class="card-body">
                                    <h6 class="card-subtitle mb-2 text-muted">Event Information</h6>
                                    <p class="mb-1"><strong>Event:</strong> ${booking.event_title}</p>
                                    <p class="mb-1"><strong>Date:</strong> ${formatDate(booking.event_date)}</p>
                                    <p class="mb-1"><strong>Duration:</strong> ${booking.duration} minutes</p>
                                    <hr>
                                    <h6 class="card-subtitle mb-2 text-muted">Seat Information</h6>
                                    <p class="mb-1"><strong>Zone:</strong> ${booking.zone_name}</p>
                                    <p class="mb-1"><strong>Seat:</strong> ${booking.seat_number}</p>
                                    <hr>
                                    <h6 class="card-subtitle mb-2 text-muted">Booking Information</h6>
                                    <p class="mb-1"><strong>Booking Date:</strong> ${formatDate(booking.booking_date)}</p>
                                    <p class="mb-1"><strong>Status:</strong> 
                                        <span class="badge bg-${getStatusBadgeColor(booking.status)}">
                                            ${booking.status}
                                        </span>
                                    </p>
                                    <p class="mb-1"><strong>Price:</strong> ${formatPrice(booking.ticket_price)}</p>
                                    ${booking.payment_status ? `
                                        <p class="mb-1"><strong>Payment Status:</strong> ${booking.payment_status}</p>
                                        <p class="mb-1"><strong>Payment Method:</strong> ${booking.payment_method}</p>
                                    ` : ''}
                                </div>
                            </div>
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