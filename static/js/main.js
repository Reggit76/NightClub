// Improved main.js with better CSRF handling
// API configuration
const API_URL = '/api/v1';
let currentUser = null;
let csrfToken = null;
let csrfTokenExpiry = null;

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

// Improved CSRF token management
async function getCsrfToken(forceRefresh = false) {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('No auth token, skipping CSRF');
        return null;
    }
    
    // Check if we have a valid CSRF token
    if (!forceRefresh && csrfToken && csrfTokenExpiry && new Date() < csrfTokenExpiry) {
        return csrfToken;
    }
    
    try {
        console.log('Fetching new CSRF token...');
        const response = await fetch(`${API_URL}/csrf-token`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            csrfToken = data.csrf_token;
            // Set expiry to 23 hours from now (tokens are valid for 24 hours)
            csrfTokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);
            console.log('CSRF token obtained successfully');
            return csrfToken;
        } else {
            console.warn('Failed to get CSRF token:', response.status);
            csrfToken = null;
            csrfTokenExpiry = null;
            return null;
        }
    } catch (error) {
        console.warn('Failed to get CSRF token:', error);
        csrfToken = null;
        csrfTokenExpiry = null;
        return null;
    }
}

// Enhanced API request helper
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
    };
    
    // Add CSRF token for state-changing requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase())) {
        // Skip CSRF for auth endpoints
        if (!endpoint.includes('/auth/')) {
            const csrf = await getCsrfToken();
            if (csrf) {
                defaultOptions.headers['X-CSRF-Token'] = csrf;
                console.log('Added CSRF token to request');
            } else {
                console.warn('No CSRF token available for request');
            }
        }
    }
    
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        });
        
        console.log(`API ${options.method || 'GET'} ${endpoint}: ${response.status}`);
        
        // Handle specific status codes
        if (response.status === 401) {
            if (!endpoint.includes('/auth/login')) {
                console.log('Unauthorized - clearing auth data');
                localStorage.removeItem('token');
                currentUser = null;
                csrfToken = null;
                csrfTokenExpiry = null;
                updateAuthUI();
                showError('Сессия истекла. Пожалуйста, войдите снова.');
            }
            throw new Error('Unauthorized');
        }
        
        if (response.status === 403) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.detail || 'У вас нет прав для выполнения этого действия';
            
            // If CSRF token is invalid, try to refresh it
            if (errorMessage.includes('CSRF')) {
                console.log('CSRF token invalid, refreshing...');
                await getCsrfToken(true); // Force refresh
                showError('Токен безопасности истек. Попробуйте еще раз.');
            } else {
                showError(errorMessage);
            }
            throw new Error('Forbidden');
        }
        
        if (response.status === 404) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.detail || 'Запрашиваемый ресурс не найден';
            showError(errorMessage);
            throw new Error('Not Found');
        }
        
        if (response.status === 422) {
            const data = await response.json();
            if (data.detail && Array.isArray(data.detail)) {
                const errorMessages = data.detail.map(err => err.msg || err.message || 'Ошибка валидации');
                showError(errorMessages.join(', '));
            } else if (data.detail) {
                showError(data.detail);
            } else {
                showError('Ошибка валидации данных');
            }
            throw new Error('Validation Error');
        }
        
        if (response.status >= 500) {
            showError('Внутренняя ошибка сервера. Попробуйте позже.');
            throw new Error('Server Error');
        }
        
        // Try to parse JSON response
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        if (!response.ok) {
            const errorMessage = typeof data === 'object' && data.detail ? data.detail : 'Что-то пошло не так';
            showError(errorMessage);
            throw new Error(errorMessage);
        }
        
        return data;
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            showError('Ошибка подключения к серверу. Проверьте интернет-соединение.');
        } else if (!['Unauthorized', 'Forbidden', 'Not Found', 'Validation Error', 'Server Error'].includes(error.message)) {
            console.error('API request error:', error);
            showError(error.message || 'Произошла неизвестная ошибка');
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
                window.history.pushState({}, '', '/events');
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

// Enhanced authentication status check
async function checkAuthStatus() {
    console.log('Checking auth status...');
    
    const token = localStorage.getItem('token');
    if (token) {
        try {
            // Split token and decode payload
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid token format');
            }
            
            const payload = JSON.parse(atob(parts[1]));
            console.log('Token payload:', payload);
            
            // Check if token is not expired (with 5 minute buffer)
            const now = Math.floor(Date.now() / 1000);
            const expiry = payload.exp;
            
            if (expiry && expiry > now + 300) { // 5 minute buffer
                // Create user object with proper structure
                currentUser = {
                    user_id: payload.user_id || parseInt(payload.sub),
                    username: payload.username,
                    role: payload.role || 'user',
                    sub: payload.sub
                };
                
                console.log('User authenticated from token:', currentUser);
                
                // Try to get additional user info and refresh CSRF token
                try {
                    const [userInfo, csrfResponse] = await Promise.allSettled([
                        apiRequest('/auth/me'),
                        getCsrfToken()
                    ]);
                    
                    if (userInfo.status === 'fulfilled' && userInfo.value.role) {
                        currentUser.role = userInfo.value.role;
                        currentUser.username = userInfo.value.username;
                        currentUser.email = userInfo.value.email;
                        currentUser.first_name = userInfo.value.first_name;
                        currentUser.last_name = userInfo.value.last_name;
                        console.log('User info updated from API:', currentUser);
                    }
                    
                    if (csrfResponse.status === 'fulfilled') {
                        console.log('CSRF token obtained during auth check');
                    }
                } catch (error) {
                    console.warn('Could not fetch additional user info:', error);
                }
                
                updateAuthUI();
                
            } else {
                console.log('Token expired or about to expire, removing...');
                localStorage.removeItem('token');
                currentUser = null;
                csrfToken = null;
                csrfTokenExpiry = null;
                updateAuthUI();
            }
        } catch (error) {
            console.error('Invalid token, removing...', error);
            localStorage.removeItem('token');
            currentUser = null;
            csrfToken = null;
            csrfTokenExpiry = null;
            updateAuthUI();
        }
    } else {
        console.log('No token found');
        currentUser = null;
        csrfToken = null;
        csrfTokenExpiry = null;
        updateAuthUI();
    }
}

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
        
        // Clear CSRF token
        csrfToken = null;
        csrfTokenExpiry = null;
        
        // If on a page requiring auth, redirect to events
        const currentPage = window.location.pathname.substring(1) || 'events';
        if (!canAccessPage(currentPage)) {
            navigateTo('events');
        }
    }
}

// Initialize app
$(document).ready(function() {
    console.log('Initializing Night Club Booking System...');
    
    // Wait a bit for all scripts to load, then initialize routes
    setTimeout(function() {
        initializeRoutes();
        checkAuthStatus();
        setupEventHandlers();
        
        // Initial page load based on URL
        const path = window.location.pathname.substring(1);
        navigateTo(path || 'events');
    }, 100);
});

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
}

// Periodic CSRF token refresh (every 20 hours)
setInterval(async () => {
    if (currentUser && localStorage.getItem('token')) {
        console.log('Refreshing CSRF token...');
        await getCsrfToken(true);
    }
}, 20 * 60 * 60 * 1000); // 20 hours

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
    console.log('CSRF Token:', csrfToken ? csrfToken.substring(0, 20) + '...' : null);
    console.log('CSRF Expiry:', csrfTokenExpiry);
    console.log('Auth Token:', localStorage.getItem('token') ? 'Present' : 'None');
    console.log('Routes:', Object.keys(routes));
    console.log('================');
};