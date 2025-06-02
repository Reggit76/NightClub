// API configuration
const API_URL = '/api/v1';
let currentUser = null;

// Router configuration
const routes = {
    'events': loadEvents,
    'my-bookings': loadMyBookings,
    'admin': loadAdminPanel
};

// Utility functions
function showLoading() {
    $('#content').html('<div class="loading"></div>');
}

function showError(message) {
    const toast = `
        <div class="toast-container">
            <div class="toast show" role="alert">
                <div class="toast-header bg-danger text-white">
                    <strong class="me-auto">Error</strong>
                    <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">${message}</div>
            </div>
        </div>
    `;
    
    $('.toast-container').remove();
    $('body').append(toast);
    setTimeout(() => $('.toast-container').remove(), 3000);
}

function showSuccess(message) {
    const toast = `
        <div class="toast-container">
            <div class="toast show" role="alert">
                <div class="toast-header bg-success text-white">
                    <strong class="me-auto">Success</strong>
                    <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">${message}</div>
            </div>
        </div>
    `;
    
    $('.toast-container').remove();
    $('body').append(toast);
    setTimeout(() => $('.toast-container').remove(), 3000);
}

function formatDate(dateString) {
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString('ru-RU', options);
}

function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB'
    }).format(price);
}

// API request helper
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
    };
    
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Что-то пошло не так');
        }
        
        return await response.json();
    } catch (error) {
        showError(error.message);
        throw error;
    }
}

// Page navigation
function navigateTo(page) {
    showLoading();
    
    const route = routes[page];
    if (route) {
        route();
        // Update URL without reload
        window.history.pushState({}, '', '/' + page);
    } else {
        loadEvents();
        window.history.pushState({}, '', '/');
    }
    
    // Update active nav link
    $('.nav-link').removeClass('active');
    $(`[data-page="${page}"]`).addClass('active');
}

// Handle browser navigation
window.addEventListener('popstate', () => {
    const path = window.location.pathname.substring(1);
    navigateTo(path || 'events');
});

// Initialize app
$(document).ready(function() {
    // Check authentication status
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUser = payload;
            updateAuthUI();
        } catch (error) {
            localStorage.removeItem('token');
        }
    }
    
    // Navigation event handlers
    $('.nav-link').click(function(e) {
        e.preventDefault();
        const page = $(this).data('page');
        navigateTo(page);
    });
    
    // Initial page load based on URL
    const path = window.location.pathname.substring(1);
    navigateTo(path || 'events');
});

// Update UI based on authentication status
function updateAuthUI() {
    if (currentUser) {
        $('.auth-buttons').addClass('d-none');
        $('.user-info').removeClass('d-none');
        $('.username').text(currentUser.username);
        $('.auth-required').show();
        
        if (['admin', 'moderator'].includes(currentUser.role)) {
            $('.admin-only').show();
        } else {
            $('.admin-only').hide();
        }
    } else {
        $('.auth-buttons').removeClass('d-none');
        $('.user-info').addClass('d-none');
        $('.auth-required').hide();
        $('.admin-only').hide();
    }
} 