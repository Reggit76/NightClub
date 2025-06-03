// Enhanced authentication module
let authCallbacks = [];

// Register callback for auth state changes
function onAuthStateChanged(callback) {
    authCallbacks.push(callback);
}

// Notify all registered callbacks
function notifyAuthStateChanged() {
    authCallbacks.forEach(callback => callback(currentUser));
}

// Login function
async function login(username, password) {
    try {
        const response = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (response && response.access_token) {
            // Store token if using JWT
            localStorage.setItem('access_token', response.access_token);
            
            // Update current user
            await checkAuthStatus();
            
            // Notify about auth state change
            notifyAuthStateChanged();
            
            return true;
        }
        return false;
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

// Logout function
async function logout() {
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        // Clear local storage
        localStorage.removeItem('access_token');
        
        // Clear current user
        currentUser = null;
        
        // Update UI
        updateAuthUI();
        
        // Notify about auth state change
        notifyAuthStateChanged();
        
        // Redirect to events page
        navigateTo('events');
    }
}

// Register function
async function register(userData) {
    try {
        const response = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });

        if (response && response.user_id) {
            showSuccess('Регистрация успешна! Теперь вы можете войти.');
            return true;
        }
        return false;
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
            await checkAuthStatus();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Session refresh error:', error);
        return false;
    }
}

// Show login modal
function showLoginModal() {
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
                        <form id="loginForm">
                            <div class="mb-3">
                                <label class="form-label">Имя пользователя</label>
                                <input type="text" class="form-control" name="username" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Пароль</label>
                                <input type="password" class="form-control" name="password" required>
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
    const loginModal = new bootstrap.Modal('#loginModal');
    loginModal.show();
    
    // Handle form submission
    $('#loginForm').on('submit', async function(e) {
        e.preventDefault();
        
        const submitBtn = $(this).find('button[type="submit"]');
        const originalText = submitBtn.html();
        
        try {
            submitBtn.prop('disabled', true)
                    .html('<i class="fas fa-spinner fa-spin me-2"></i>Вход...');
            
            const username = $(this).find('input[name="username"]').val();
            const password = $(this).find('input[name="password"]').val();
            
            await login(username, password);
            
            loginModal.hide();
            showSuccess('Вход выполнен успешно!');
            
        } catch (error) {
            showError(error.message || 'Ошибка входа');
        } finally {
            submitBtn.prop('disabled', false).html(originalText);
        }
    });
}

// Show register modal
function showRegisterModal() {
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
                        <form id="registerForm">
                            <div class="mb-3">
                                <label class="form-label">Имя пользователя *</label>
                                <input type="text" class="form-control" name="username" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Email *</label>
                                <input type="email" class="form-control" name="email" required>
                            </div>
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Имя</label>
                                        <input type="text" class="form-control" name="first_name">
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Фамилия</label>
                                        <input type="text" class="form-control" name="last_name">
                                    </div>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Пароль *</label>
                                <input type="password" class="form-control" name="password" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Подтверждение пароля *</label>
                                <input type="password" class="form-control" name="password_confirm" required>
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
    const registerModal = new bootstrap.Modal('#registerModal');
    registerModal.show();
    
    // Handle form submission
    $('#registerForm').on('submit', async function(e) {
        e.preventDefault();
        
        const submitBtn = $(this).find('button[type="submit"]');
        const originalText = submitBtn.html();
        
        try {
            submitBtn.prop('disabled', true)
                    .html('<i class="fas fa-spinner fa-spin me-2"></i>Регистрация...');
            
            const formData = {
                username: $(this).find('input[name="username"]').val(),
                email: $(this).find('input[name="email"]').val(),
                first_name: $(this).find('input[name="first_name"]').val(),
                last_name: $(this).find('input[name="last_name"]').val(),
                password: $(this).find('input[name="password"]').val()
            };
            
            const passwordConfirm = $(this).find('input[name="password_confirm"]').val();
            
            if (formData.password !== passwordConfirm) {
                throw new Error('Пароли не совпадают');
            }
            
            await register(formData);
            
            registerModal.hide();
            showLoginModal();
            
        } catch (error) {
            showError(error.message || 'Ошибка регистрации');
        } finally {
            submitBtn.prop('disabled', false).html(originalText);
        }
    });
}

// Initialize auth listeners
$(document).ready(function() {
    // Check auth status on page load
    checkAuthStatus();
    
    // Setup auth button handlers
    $(document).on('click', '.btn-login', function(e) {
        e.preventDefault();
        showLoginModal();
    });
    
    $(document).on('click', '.btn-logout', async function(e) {
        e.preventDefault();
        await logout();
    });
    
    // Start session refresh timer
    setInterval(async () => {
        if (currentUser) {
            await refreshSession();
        }
    }, 15 * 60 * 1000); // Refresh every 15 minutes
});