// Improved main.js with better authentication handling
// API configuration
const API_URL = '/api/v1';
let currentUser = null;

// Add cache busting for development
const CACHE_VERSION = Date.now();

// Router configuration
let routes = {};

// Utility functions
function showLoading() {
    $('#content').html(`
        <div class="d-flex justify-content-center align-items-center" style="min-height: 300px;">
            <div class="text-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Загрузка...</span>
                </div>
                <p class="mt-3 text-muted">Загрузка...</p>
            </div>
        </div>
    `);
}

function showError(message) {
    console.error('Error:', message);
    const toast = `
        <div class="toast-container position-fixed top-0 end-0 p-3" style="z-index: 9999;">
            <div class="toast show" role="alert">
                <div class="toast-header bg-danger text-white">
                    <strong class="me-auto">
                        <i class="fas fa-exclamation-triangle me-1"></i>Ошибка
                    </strong>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">${message}</div>
            </div>
        </div>
    `;
    
    // Remove existing error toasts
    $('.toast-container').filter(':has(.bg-danger)').remove();
    $('body').append(toast);
    
    setTimeout(() => {
        $('.toast-container').filter(':has(.bg-danger)').remove();
    }, 5000);
}

function showSuccess(message) {
    console.log('Success:', message);
    const toast = `
        <div class="toast-container position-fixed top-0 end-0 p-3" style="z-index: 9999;">
            <div class="toast show" role="alert">
                <div class="toast-header bg-success text-white">
                    <strong class="me-auto">
                        <i class="fas fa-check-circle me-1"></i>Успех
                    </strong>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">${message}</div>
            </div>
        </div>
    `;
    
    // Remove existing success toasts
    $('.toast-container').filter(':has(.bg-success)').remove();
    $('body').append(toast);
    
    setTimeout(() => {
        $('.toast-container').filter(':has(.bg-success)').remove();
    }, 3000);
}

function formatDate(dateString) {
    if (!dateString) return 'Не указано';
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
    if (price === null || price === undefined) return '0 ₽';
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB'
    }).format(price);
}

// Enhanced API request helper
async function apiRequest(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    };
    
    // Add Authorization header if we have a token
    const token = localStorage.getItem('access_token');
    if (token) {
        defaultOptions.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Ensure endpoint starts with API_URL
    const url = endpoint.startsWith('/api/') ? endpoint : `${API_URL}${endpoint}`;
    
    try {
        const response = await fetch(url, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        });
        
        console.log(`API ${options.method || 'GET'} ${url}: ${response.status}`);
        
        // Handle specific status codes
        if (response.status === 401) {
            console.warn('Unauthorized - clearing auth data');
            localStorage.removeItem('access_token');
            currentUser = null;
            updateAuthUI();
            
            if (!endpoint.includes('/auth/')) {
                showError('Сессия истекла. Пожалуйста, войдите снова.');
                showLoginModal();
            }
            throw new Error('Unauthorized');
        }
        
        if (response.status === 403) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'У вас нет прав для выполнения этого действия');
        }
        
        if (response.status === 500) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Внутренняя ошибка сервера');
        }
        
        // Parse JSON response
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || `HTTP ${response.status}: ${response.statusText}`);
            }
            return data;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return null;
    } catch (error) {
        console.error(`API error (${url}):`, error);
        
        // Don't show network errors for auth endpoints
        if (!endpoint.includes('/auth/') && !error.message.includes('Unauthorized')) {
            // Only show error if it's not a network issue during auth check
            if (!(error.name === 'TypeError' && error.message.includes('fetch'))) {
                showError(error.message || 'Ошибка сети');
            }
        }
        
        throw error;
    }
}

// Page navigation with better error handling
function navigateTo(page) {
    console.log('Navigating to:', page);
    
    // Check if routes are initialized
    if (!routes || Object.keys(routes).length === 0) {
        console.warn('Routes not initialized yet, retrying...');
        setTimeout(() => navigateTo(page), 100);
        return;
    }
    
    // Check page access
    if (!canAccessPage(page)) {
        showError('У вас нет доступа к этой странице');
        return;
    }

    showLoading();
    
    const route = routes[page];
    if (route && typeof route === 'function') {
        try {
            route();
            // Update URL without reload
            window.history.pushState({}, '', '/' + page);
        } catch (error) {
            console.error('Error loading page:', error);
            showError('Ошибка загрузки страницы');
            // Fallback to events page
            if (page !== 'events' && routes['events']) {
                routes['events']();
                window.history.pushState({}, '', '/');
            }
        }
    } else {
        console.warn(`Route '${page}' not found, loading events`);
        if (routes['events'] && typeof routes['events'] === 'function') {
            routes['events']();
            window.history.pushState({}, '', '/');
        } else {
            // Ultimate fallback
            $('#content').html(`
                <div class="alert alert-warning">
                    <h4>Добро пожаловать в Night Club!</h4>
                    <p>Система загружается... Пожалуйста, подождите.</p>
                </div>
            `);
        }
    }
    
    // Update active nav link
    $('.nav-link').removeClass('active');
    $(`[data-page="${page}"]`).addClass('active');
}

// Check if user can access the page
function canAccessPage(page) {
    if (page === 'events') return true;
    if (!currentUser) return false;
    if (page === 'my-bookings' || page === 'profile') return true;
    if (page === 'admin') return ['admin', 'moderator'].includes(currentUser.role);
    return true;
}

// Handle browser navigation
window.addEventListener('popstate', () => {
    const path = window.location.pathname.substring(1);
    navigateTo(path || 'events');
});

// Update UI based on authentication status
function updateAuthUI() {
    console.log('Updating auth UI for user:', currentUser);
    
    if (currentUser) {
        $('.auth-buttons').addClass('d-none');
        $('.user-info').removeClass('d-none');
        $('.username').text(currentUser.username);
        
        // Show/hide auth-required elements
        $('.auth-required').show();
        
        // Show/hide admin-only elements
        if (['admin', 'moderator'].includes(currentUser.role)) {
            $('.admin-only').show();
            console.log('Showing admin elements for role:', currentUser.role);
        } else {
            $('.admin-only').hide();
            console.log('Hiding admin elements for role:', currentUser.role);
        }
        
        // If current page is not accessible, redirect to events
        const currentPage = window.location.pathname.substring(1) || 'events';
        if (!canAccessPage(currentPage)) {
            navigateTo('events');
        }
    } else {
        $('.auth-buttons').removeClass('d-none');
        $('.user-info').addClass('d-none');
        $('.auth-required').hide();
        $('.admin-only').hide();
        
        // If on a page requiring auth, redirect to events
        const currentPage = window.location.pathname.substring(1) || 'events';
        if (!canAccessPage(currentPage)) {
            navigateTo('events');
        }
    }
}

// Initialize application
async function initializeApp() {
    console.log('Initializing application...');
    
    // Check auth status first
    try {
        await checkAuthStatus();
    } catch (error) {
        console.warn('Auth check failed during initialization:', error);
    }
    
    // Initialize routes
    initializeRoutes();
    
    // Setup event handlers
    setupEventHandlers();
    
    // Load initial page
    const path = window.location.pathname.substring(1) || 'events';
    navigateTo(path);
    
    console.log('Application initialized');
}

// Initialize routes after all scripts are loaded
function initializeRoutes() {
    console.log('Initializing routes...');
    
    routes = {
        'events': typeof loadEvents !== 'undefined' ? loadEvents : function() { 
            console.error('loadEvents not found'); 
            showEventsPlaceholder();
        },
        'my-bookings': typeof loadMyBookings !== 'undefined' ? loadMyBookings : function() { 
            console.error('loadMyBookings not found'); 
            showError('Страница бронирований недоступна');
        },
        'admin': typeof loadAdminPanel !== 'undefined' ? loadAdminPanel : function() { 
            console.error('loadAdminPanel not found'); 
            showError('Административная панель недоступна');
        },
        'profile': typeof loadProfile !== 'undefined' ? loadProfile : function() { 
            console.error('loadProfile not found'); 
            showError('Страница профиля недоступна');
        }
    };
    
    console.log('Routes initialized:', Object.keys(routes));
}

// Fallback events page
function showEventsPlaceholder() {
    $('#content').html(`
        <div class="row mb-4">
            <div class="col">
                <h2><i class="fas fa-calendar-alt me-2"></i>Предстоящие мероприятия</h2>
            </div>
        </div>
        <div class="alert alert-info">
            <i class="fas fa-info-circle me-2"></i>
            Система загружается... Если эта страница не обновляется автоматически, 
            <a href="#" onclick="location.reload()">обновите страницу</a>.
        </div>
    `);
}

// Setup event handlers
function setupEventHandlers() {
    // Navigation event handlers for navbar links
    $('.nav-link').off('click').on('click', function(e) {
        e.preventDefault();
        const page = $(this).data('page');
        if (page) {
            navigateTo(page);
        }
    });
    
    // Navigation event handlers for dropdown links
    $(document).off('click', '.dropdown-item[data-page]').on('click', '.dropdown-item[data-page]', function(e) {
        e.preventDefault();
        const page = $(this).data('page');
        if (page) {
            navigateTo(page);
        }
    });
    
    // Auto-dismiss toasts
    $(document).on('click', '.toast .btn-close', function() {
        $(this).closest('.toast-container').remove();
    });
    
    // Global auth button handlers
    $(document).on('click', '[data-bs-target="#loginModal"]', function(e) {
        e.preventDefault();
        showLoginModal();
    });
    
    $(document).on('click', '[data-bs-target="#registerModal"]', function(e) {
        e.preventDefault();
        showRegisterModal();
    });
}

// Handle uncaught errors
window.addEventListener('error', function(e) {
    console.error('Uncaught error:', e.error);
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    e.preventDefault();
});

// Global debug function
window.debugNightClub = function() {
    console.log('=== DEBUG INFO ===');
    console.log('Current User:', currentUser);
    console.log('Routes:', Object.keys(routes));
    console.log('Token:', localStorage.getItem('access_token') ? 'Present' : 'None');
    console.log('================');
};

// Initialize when document is ready
$(document).ready(function() {
    console.log('Document ready, initializing application...');
    
    // Wait a bit for all scripts to load
    setTimeout(() => {
        initializeApp();
    }, 100);
    
    // Listen for auth state changes
    window.addEventListener('authChanged', function(event) {
        console.log('Auth state changed:', event.detail);
        updateAuthUI();
    });
});

// Make key functions globally available
window.apiRequest = apiRequest;
window.navigateTo = navigateTo;
window.updateAuthUI = updateAuthUI;
window.formatDate = formatDate;
window.formatPrice = formatPrice;
window.showError = showError;
window.showSuccess = showSuccess;