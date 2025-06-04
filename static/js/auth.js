// Enhanced authentication module
let authCallbacks = [];

// Register callback for auth state changes
function onAuthStateChanged(callback) {
    authCallbacks.push(callback);
}

// Notify all registered callbacks
function notifyAuthStateChanged() {
    authCallbacks.forEach(callback => {
        try {
            callback(currentUser);
        } catch (error) {
            console.error('Auth callback error:', error);
        }
    });
    
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('authChanged', { detail: currentUser }));
}

// Login function - updated to handle both direct calls and form events
async function login(usernameOrEvent, password = null) {
    try {
        let username, pwd;
        
        // Handle both form event and direct parameters
        if (typeof usernameOrEvent === 'object' && usernameOrEvent.preventDefault) {
            // It's an event object
            const event = usernameOrEvent;
            event.preventDefault();
            
            const form = event.target;
            const formData = new FormData(form);
            username = formData.get('username');
            pwd = formData.get('password');
        } else {
            // Direct parameters
            username = usernameOrEvent;
            pwd = password;
        }

        if (!username || !pwd) {
            throw new Error('Имя пользователя и пароль обязательны');
        }

        console.log('Attempting login for:', username);

        const response = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ 
                username: username.trim(), 
                password: pwd 
            })
        });

        if (response && response.access_token) {
            // Store token
            localStorage.setItem('access_token', response.access_token);
            
            // Update current user
            currentUser = response.user;
            
            console.log('Login successful for user:', currentUser);
            
            // Update UI and notify
            updateAuthUI();
            notifyAuthStateChanged();
            
            return true;
        }
        
        throw new Error('Неверный ответ сервера');
        
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

// Logout function
async function logout() {
    try {
        // Try to notify server about logout
        try {
            await apiRequest('/auth/logout', { method: 'POST' });
        } catch (error) {
            console.warn('Server logout failed:', error);
        }
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        // Always clear local data
        localStorage.removeItem('access_token');
        currentUser = null;
        
        console.log('User logged out');
        
        // Update UI and notify
        updateAuthUI();
        notifyAuthStateChanged();
        
        // Redirect to events page
        navigateTo('events');
        
        showSuccess('Вы успешно вышли из системы');
    }
}

// Register function - updated to handle form events
async function register(userDataOrEvent) {
    try {
        let userData;
        
        // Handle both form event and direct parameters
        if (typeof userDataOrEvent === 'object' && userDataOrEvent.preventDefault) {
            // It's an event object
            const event = userDataOrEvent;
            event.preventDefault();
            
            const form = event.target;
            const formData = new FormData(form);
            
            // Validate passwords match
            const password = formData.get('password');
            const passwordConfirm = formData.get('password_confirm');
            
            if (password !== passwordConfirm) {
                throw new Error('Пароли не совпадают');
            }
            
            userData = {
                username: formData.get('username'),
                email: formData.get('email'),
                first_name: formData.get('first_name') || '',
                last_name: formData.get('last_name') || '',
                password: password
            };
        } else {
            // Direct object
            userData = userDataOrEvent;
        }

        // Validate required fields
        if (!userData.username || !userData.email || !userData.password) {
            throw new Error('Пожалуйста, заполните все обязательные поля');
        }

        console.log('Attempting registration for:', userData.username);

        const response = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });

        if (response && response.user_id) {
            console.log('Registration successful');
            showSuccess('Регистрация успешна! Теперь вы можете войти.');
            return true;
        }
        
        throw new Error('Неверный ответ сервера');
        
    } catch (error) {
        console.error('Register error:', error);
        throw error;
    }
}

// Session refresh function
async function refreshSession() {
    try {
        const response = await apiRequest('/auth/refresh', {
            method: 'POST'
        });

        if (response && response.access_token) {
            localStorage.setItem('access_token', response.access_token);
            console.log('Session refreshed successfully');
            return true;
        }
        return false;
    } catch (error) {
        console.error('Session refresh error:', error);
        return false;
    }
}

// Check authentication status
async function checkAuthStatus() {
    try {
        // Check if we have a token
        const token = localStorage.getItem('access_token');
        if (!token) {
            currentUser = null;
            updateAuthUI();
            return false;
        }

        // Try to get current user info
        const userInfo = await apiRequest('/auth/me');
        
        if (userInfo) {
            currentUser = {
                user_id: userInfo.user_id,
                username: userInfo.username,
                email: userInfo.email,
                first_name: userInfo.first_name,
                last_name: userInfo.last_name,
                role: userInfo.role,
                is_active: userInfo.is_active,
                stats: userInfo.stats
            };
            
            console.log('Auth check successful, user:', currentUser);
            updateAuthUI();
            return true;
        }
    } catch (error) {
        console.warn('Auth check failed:', error);
        if (error.message === 'Unauthorized' || error.message.includes('Token')) {
            // Clear invalid token
            localStorage.removeItem('access_token');
            currentUser = null;
            updateAuthUI();
            return false;
        }
        // For other errors, don't show them
    }
    return false;
}

// Show login modal
function showLoginModal() {
    // Hide any existing modals first
    $('.modal').modal('hide');
    
    const modal = `
        <div class="modal fade" id="loginModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-sign-in-alt me-2"></i>Вход в систему
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="loginForm" onsubmit="login(event)">
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="fas fa-user me-1"></i>Имя пользователя
                                </label>
                                <input type="text" class="form-control" name="username" required 
                                       placeholder="Введите имя пользователя" autocomplete="username">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="fas fa-lock me-1"></i>Пароль
                                </label>
                                <input type="password" class="form-control" name="password" required
                                       placeholder="Введите пароль" autocomplete="current-password">
                            </div>
                            <div class="mb-3">
                                <div class="alert alert-info">
                                    <strong>Тестовые аккаунты:</strong><br>
                                    <small>
                                        Админ: <code>admin</code> / <code>admin123</code><br>
                                        Пользователь: <code>user123</code> / <code>test123</code>
                                    </small>
                                </div>
                            </div>
                            <div class="d-grid">
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-sign-in-alt me-2"></i>Войти
                                </button>
                            </div>
                        </form>
                        <hr>
                        <p class="text-center mb-0">
                            <a href="#" onclick="showRegisterModal()">
                                Нет аккаунта? Зарегистрируйтесь
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    $('#loginModal').remove();
    
    // Add new modal to DOM
    $('body').append(modal);
    
    // Show modal
    $('#loginModal').modal('show');
}

// Show register modal
function showRegisterModal() {
    // Hide any existing modals first
    $('.modal').modal('hide');
    
    const modal = `
        <div class="modal fade" id="registerModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-user-plus me-2"></i>Регистрация
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="registerForm" onsubmit="register(event)">
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="fas fa-user me-1"></i>Имя пользователя *
                                </label>
                                <input type="text" class="form-control" name="username" required
                                       placeholder="Минимум 3 символа" autocomplete="username">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="fas fa-envelope me-1"></i>Email *
                                </label>
                                <input type="email" class="form-control" name="email" required
                                       placeholder="your@email.com" autocomplete="email">
                            </div>
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Имя</label>
                                        <input type="text" class="form-control" name="first_name"
                                               placeholder="Ваше имя" autocomplete="given-name">
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Фамилия</label>
                                        <input type="text" class="form-control" name="last_name"
                                               placeholder="Ваша фамилия" autocomplete="family-name">
                                    </div>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="fas fa-lock me-1"></i>Пароль *
                                </label>
                                <input type="password" class="form-control" name="password" required
                                       placeholder="Минимум 6 символов" minlength="6" autocomplete="new-password">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="fas fa-lock me-1"></i>Подтверждение пароля *
                                </label>
                                <input type="password" class="form-control" name="password_confirm" required
                                       placeholder="Повторите пароль" autocomplete="new-password">
                            </div>
                            <div class="d-grid">
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-user-plus me-2"></i>Зарегистрироваться
                                </button>
                            </div>
                        </form>
                        <hr>
                        <p class="text-center mb-0">
                            <a href="#" onclick="showLoginModal()">
                                Уже есть аккаунт? Войдите
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modals
    $('#loginModal').remove();
    $('#registerModal').remove();
    
    // Add new modal to DOM
    $('body').append(modal);
    
    // Show modal
    $('#registerModal').modal('show');
}

// Initialize auth listeners
$(document).ready(function() {
    console.log('Auth module initialized');
    
    // Setup global form handlers
    $(document).on('submit', '#loginForm', async function(e) {
        e.preventDefault();
        
        const submitBtn = $(this).find('button[type="submit"]');
        const originalText = submitBtn.html();
        
        try {
            submitBtn.prop('disabled', true)
                    .html('<i class="fas fa-spinner fa-spin me-2"></i>Вход...');
            
            await login(e);
            
            $('#loginModal').modal('hide');
            showSuccess('Вход выполнен успешно!');
            
        } catch (error) {
            showError(error.message || 'Ошибка входа');
        } finally {
            submitBtn.prop('disabled', false).html(originalText);
        }
    });
    
    $(document).on('submit', '#registerForm', async function(e) {
        e.preventDefault();
        
        const submitBtn = $(this).find('button[type="submit"]');
        const originalText = submitBtn.html();
        
        try {
            submitBtn.prop('disabled', true)
                    .html('<i class="fas fa-spinner fa-spin me-2"></i>Регистрация...');
            
            await register(e);
            
            $('#registerModal').modal('hide');
            showLoginModal();
            
        } catch (error) {
            showError(error.message || 'Ошибка регистрации');
        } finally {
            submitBtn.prop('disabled', false).html(originalText);
        }
    });
    
    // Setup auth button handlers
    $(document).on('click', '.btn-login', function(e) {
        e.preventDefault();
        showLoginModal();
    });
    
    $(document).on('click', '.btn-logout', async function(e) {
        e.preventDefault();
        await logout();
    });
    
    // Start session refresh timer (every 25 minutes)
    setInterval(async () => {
        if (currentUser && localStorage.getItem('access_token')) {
            await refreshSession();
        }
    }, 25 * 60 * 1000);
});

// Make functions globally available
window.login = login;
window.register = register;
window.logout = logout;
window.checkAuthStatus = checkAuthStatus;
window.showLoginModal = showLoginModal;
window.showRegisterModal = showRegisterModal;