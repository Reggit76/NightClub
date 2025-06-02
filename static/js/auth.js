// Login function
async function login(event) {
    event.preventDefault();
    
    const form = document.getElementById('loginForm');
    const formData = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    // Show loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Вход...';
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({
                username: formData.get('username').trim(),
                password: formData.get('password')
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Неверное имя пользователя или пароль');
            } else if (response.status === 422) {
                throw new Error(data.detail || 'Ошибка валидации данных');
            } else {
                throw new Error(data.detail || 'Ошибка входа');
            }
        }
        
        console.log('Login response:', data);
        
        // Store token and update user data
        localStorage.setItem('token', data.access_token);
        
        // Parse token to get user info
        const tokenParts = data.access_token.split('.');
        const tokenPayload = JSON.parse(atob(tokenParts[1]));
        
        // Create currentUser object with all available data
        currentUser = {
            user_id: data.user?.user_id || parseInt(tokenPayload.sub || tokenPayload.user_id),
            username: data.user?.username || tokenPayload.username,
            email: data.user?.email,
            first_name: data.user?.first_name,
            last_name: data.user?.last_name,
            role: data.user?.role || tokenPayload.role || 'user',
            sub: tokenPayload.sub || tokenPayload.user_id
        };
        
        console.log('Current user set to:', currentUser);
        
        // Store CSRF token if provided
        if (data.csrf_token) {
            csrfToken = data.csrf_token;
        }
        
        // Close modal and update UI
        $('#loginModal').modal('hide');
        form.reset();
        updateAuthUI();
        showSuccess('Вы успешно вошли в систему');
        
        // Redirect to events page
        navigateTo('events');
    } catch (error) {
        console.error('Login error:', error);
        showError(error.message);
    } finally {
        // Restore button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Register function
async function register(event) {
    event.preventDefault();
    
    const form = document.getElementById('registerForm');
    const formData = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    // Client-side validation
    const username = formData.get('username').trim();
    const email = formData.get('email').trim();
    const firstName = formData.get('first_name').trim();
    const lastName = formData.get('last_name').trim();
    const password = formData.get('password');
    const passwordConfirm = formData.get('password_confirm');
    
    // Validate required fields
    if (!username || !email || !firstName || !lastName || !password) {
        showError('Пожалуйста, заполните все обязательные поля');
        return;
    }
    
    // Validate username
    if (username.length < 3) {
        showError('Имя пользователя должно содержать минимум 3 символа');
        return;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showError('Имя пользователя может содержать только буквы, цифры и подчеркивания');
        return;
    }
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showError('Пожалуйста, введите корректный email адрес');
        return;
    }
    
    // Validate password
    if (password.length < 6) {
        showError('Пароль должен содержать минимум 6 символов');
        return;
    }
    
    // Validate password confirmation
    if (password !== passwordConfirm) {
        showError('Пароли не совпадают');
        return;
    }
    
    // Show loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Регистрация...';
    
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({
                username: username,
                email: email,
                first_name: firstName,
                last_name: lastName,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 422) {
                if (data.detail) {
                    if (Array.isArray(data.detail)) {
                        // FastAPI validation errors
                        const errors = data.detail.map(err => {
                            if (err.loc && err.loc.length > 1) {
                                const field = err.loc[1];
                                const message = err.msg;
                                return `${field}: ${message}`;
                            }
                            return err.msg || err.message || 'Ошибка валидации';
                        });
                        throw new Error(errors.join('\n'));
                    } else {
                        throw new Error(data.detail);
                    }
                } else {
                    throw new Error('Ошибка валидации данных');
                }
            } else {
                throw new Error(data.detail || 'Ошибка регистрации');
            }
        }
        
        console.log('Registration successful:', data);
        
        // Close modal and show success message
        $('#registerModal').modal('hide');
        form.reset();
        showSuccess('Регистрация успешна! Теперь вы можете войти в систему.');
        
        // Show login modal after a short delay
        setTimeout(() => {
            $('#loginModal').modal('show');
        }, 1000);
        
    } catch (error) {
        console.error('Registration error:', error);
        showError(error.message);
    } finally {
        // Restore button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Logout function
function logout() {
    // Clear local storage
    localStorage.removeItem('token');
    currentUser = null;
    csrfToken = null;
    
    // Update UI
    updateAuthUI();
    
    // Redirect to events page
    navigateTo('events');
    
    // Show success message
    showSuccess('Вы успешно вышли из системы');
    
    // Optional: Call logout endpoint
    fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }).catch(err => {
        // Ignore errors for logout endpoint
        console.warn('Logout endpoint error (ignored):', err);
    });
}

// Real-time validation for forms
$(document).ready(function() {
    // Username validation
    $('#registerForm input[name="username"]').on('input', function() {
        const username = $(this).val().trim();
        const feedback = $(this).siblings('.invalid-feedback');
        
        if (username.length > 0 && username.length < 3) {
            $(this).addClass('is-invalid');
            feedback.text('Минимум 3 символа');
        } else if (username.length > 0 && !/^[a-zA-Z0-9_]+$/.test(username)) {
            $(this).addClass('is-invalid');
            feedback.text('Только буквы, цифры и подчеркивания');
        } else {
            $(this).removeClass('is-invalid');
        }
    });
    
    // Email validation
    $('#registerForm input[name="email"]').on('input', function() {
        const email = $(this).val().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (email.length > 0 && !emailRegex.test(email)) {
            $(this).addClass('is-invalid');
        } else {
            $(this).removeClass('is-invalid');
        }
    });
    
    // Password confirmation validation
    $('#registerForm input[name="password_confirm"]').on('input', function() {
        const password = $('#registerForm input[name="password"]').val();
        const passwordConfirm = $(this).val();
        
        if (passwordConfirm.length > 0 && password !== passwordConfirm) {
            $(this).addClass('is-invalid');
        } else {
            $(this).removeClass('is-invalid');
        }
    });
    
    // Add Bootstrap validation classes to forms
    $('<div class="invalid-feedback"></div>').insertAfter('#registerForm input');
});