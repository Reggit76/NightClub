// Load profile page
async function loadProfile() {
    try {
        const profile = await apiRequest('/profile');
        
        // Update current user data with profile info
        if (currentUser && profile.role) {
            currentUser.role = profile.role;
        }
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2>Мой профиль</h2>
                    <p class="text-muted">Управляйте вашей личной информацией и настройками аккаунта</p>
                </div>
            </div>
            
            <div class="row">
                <div class="col-lg-8">
                    <!-- Profile Information -->
                    <div class="card profile-card mb-4">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="fas fa-user me-2"></i>Личная информация
                            </h5>
                        </div>
                        <div class="card-body">
                            <form id="profileForm">
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">
                                            <i class="fas fa-id-card me-1 text-muted"></i>Имя *
                                        </label>
                                        <input type="text" class="form-control" name="first_name" 
                                               value="${profile.first_name || ''}" required
                                               placeholder="Введите ваше имя">
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">
                                            <i class="fas fa-id-card me-1 text-muted"></i>Фамилия *
                                        </label>
                                        <input type="text" class="form-control" name="last_name" 
                                               value="${profile.last_name || ''}" required
                                               placeholder="Введите вашу фамилию">
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">
                                            <i class="fas fa-phone me-1 text-muted"></i>Телефон
                                        </label>
                                        <input type="tel" class="form-control" name="phone" 
                                               value="${profile.phone || ''}" 
                                               placeholder="+7 (999) 123-45-67"
                                               pattern="[+]?[0-9\s\-\(\)]*">
                                        <small class="form-text text-muted">
                                            Укажите номер телефона для связи
                                        </small>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">
                                            <i class="fas fa-calendar me-1 text-muted"></i>Дата рождения
                                        </label>
                                        <input type="date" class="form-control" name="birth_date" 
                                               value="${profile.birth_date || ''}"
                                               max="${new Date().toISOString().split('T')[0]}">
                                        <small class="form-text text-muted">
                                            Дата рождения используется для специальных предложений
                                        </small>
                                    </div>
                                </div>
                                <div class="d-flex justify-content-between align-items-center">
                                    <button type="submit" class="btn btn-primary">
                                        <i class="fas fa-save me-1"></i>Сохранить изменения
                                    </button>
                                    <button type="button" class="btn btn-outline-secondary" onclick="resetProfileForm()">
                                        <i class="fas fa-undo me-1"></i>Отменить
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                    
                    <!-- Change Password -->
                    <div class="card profile-card mb-4">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="fas fa-lock me-2"></i>Безопасность
                            </h5>
                        </div>
                        <div class="card-body">
                            <form id="passwordForm">
                                <div class="mb-3">
                                    <label class="form-label">
                                        <i class="fas fa-key me-1 text-muted"></i>Текущий пароль *
                                    </label>
                                    <input type="password" class="form-control" name="current_password" required
                                           placeholder="Введите текущий пароль">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">
                                        <i class="fas fa-lock me-1 text-muted"></i>Новый пароль *
                                    </label>
                                    <input type="password" class="form-control" name="new_password" required
                                           placeholder="Введите новый пароль" minlength="6">
                                    <div class="password-strength mt-2" id="passwordStrength"></div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">
                                        <i class="fas fa-lock me-1 text-muted"></i>Подтвердите новый пароль *
                                    </label>
                                    <input type="password" class="form-control" name="confirm_password" required
                                           placeholder="Повторите новый пароль">
                                    <small class="form-text text-muted">
                                        Пароль должен содержать минимум 6 символов
                                    </small>
                                </div>
                                <div class="d-flex justify-content-between align-items-center">
                                    <button type="submit" class="btn btn-warning">
                                        <i class="fas fa-shield-alt me-1"></i>Изменить пароль
                                    </button>
                                    <button type="button" class="btn btn-outline-secondary" onclick="resetPasswordForm()">
                                        <i class="fas fa-times me-1"></i>Отменить
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                    
                    <!-- Recent Activity -->
                    <div class="card profile-card">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="fas fa-history me-2"></i>Последняя активность
                            </h5>
                        </div>
                        <div class="card-body">
                            <div id="recentActivity">
                                <div class="text-center">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">Загрузка...</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-4">
                    <!-- Account Info -->
                    <div class="card profile-card mb-4">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="fas fa-info-circle me-2"></i>Информация об аккаунте
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="profile-info-item">
                                <div class="d-flex align-items-center mb-3">
                                    <div class="profile-avatar me-3">
                                        <i class="fas fa-user fa-2x text-primary"></i>
                                    </div>
                                    <div>
                                        <h6 class="mb-0">${profile.username}</h6>
                                        <small class="text-muted">${translateRole(profile.role)}</small>
                                    </div>
                                </div>
                            </div>
                            
                            <hr>
                            
                            <div class="profile-detail">
                                <strong>Email:</strong>
                                <p class="text-muted mb-2">${profile.email}</p>
                            </div>
                            
                            <div class="profile-detail">
                                <strong>Дата регистрации:</strong>
                                <p class="text-muted mb-2">${formatDate(profile.created_at)}</p>
                            </div>
                            
                            <div class="profile-detail">
                                <strong>Статус аккаунта:</strong>
                                <p class="mb-0">
                                    <span class="badge bg-success">
                                        <i class="fas fa-check-circle me-1"></i>Активен
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Statistics -->
                    <div class="card profile-card mb-4">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="fas fa-chart-bar me-2"></i>Моя статистика
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="stat-item text-center mb-4">
                                <div class="stat-number text-primary">
                                    ${profile.stats.total_bookings}
                                </div>
                                <div class="stat-label text-muted">
                                    Всего бронирований
                                </div>
                            </div>
                            
                            <div class="stat-item text-center mb-4">
                                <div class="stat-number text-success">
                                    ${formatPrice(profile.stats.total_spent)}
                                </div>
                                <div class="stat-label text-muted">
                                    Общая сумма заказов
                                </div>
                            </div>
                            
                            ${profile.stats.last_booking_date ? `
                                <div class="stat-item text-center">
                                    <div class="stat-label text-muted mb-1">
                                        Последнее бронирование
                                    </div>
                                    <div class="stat-date">
                                        ${formatDate(profile.stats.last_booking_date)}
                                    </div>
                                </div>
                            ` : `
                                <div class="text-center">
                                    <div class="empty-state">
                                        <i class="fas fa-ticket-alt fa-2x text-muted mb-2"></i>
                                        <p class="text-muted mb-0">Бронирований пока нет</p>
                                        <a href="#" onclick="navigateTo('events')" class="btn btn-sm btn-outline-primary mt-2">
                                            Просмотреть мероприятия
                                        </a>
                                    </div>
                                </div>
                            `}
                        </div>
                    </div>
                    
                    <!-- Quick Actions -->
                    <div class="card profile-card">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="fas fa-bolt me-2"></i>Быстрые действия
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="d-grid gap-2">
                                <a href="#" onclick="navigateTo('events')" class="btn btn-outline-primary">
                                    <i class="fas fa-calendar-alt me-1"></i>Посмотреть мероприятия
                                </a>
                                <a href="#" onclick="navigateTo('my-bookings')" class="btn btn-outline-secondary">
                                    <i class="fas fa-ticket-alt me-1"></i>Мои бронирования
                                </a>
                                <button class="btn btn-outline-info" onclick="downloadUserData()">
                                    <i class="fas fa-download me-1"></i>Скачать мои данные
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        $('#content').html(html);
        
        // Initialize form handlers
        initProfileFormHandler();
        initPasswordFormHandler();
        loadRecentActivity();
        
        // Store original profile data for reset functionality
        window.originalProfileData = profile;
        
    } catch (error) {
        $('#content').html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Произошла ошибка при загрузке профиля. Пожалуйста, попробуйте позже.
            </div>
        `);
    }
}

// Profile form handler
function initProfileFormHandler() {
    $('#profileForm').submit(async function(e) {
        e.preventDefault();
        
        const submitBtn = $(this).find('button[type="submit"]');
        const originalText = submitBtn.html();
        
        // Show loading state
        submitBtn.prop('disabled', true)
                 .html('<i class="fas fa-spinner fa-spin me-1"></i>Сохранение...');
        
        const formData = {
            first_name: this.first_name.value.trim(),
            last_name: this.last_name.value.trim(),
            phone: this.phone.value.trim() || null,
            birth_date: this.birth_date.value || null
        };
        
        // Client-side validation
        if (!formData.first_name || !formData.last_name) {
            showError('Имя и фамилия обязательны для заполнения');
            submitBtn.prop('disabled', false).html(originalText);
            return;
        }
        
        // Phone validation
        if (formData.phone && !validatePhone(formData.phone)) {
            showError('Введите корректный номер телефона');
            submitBtn.prop('disabled', false).html(originalText);
            return;
        }
        
        try {
            // Get CSRF token before making the request
            await getCsrfToken();
            
            const response = await apiRequest('/profile', {
                method: 'PUT',
                body: JSON.stringify(formData)
            });
            
            // Update stored original data
            if (window.originalProfileData) {
                Object.assign(window.originalProfileData, formData);
            }
            
            showSuccess('Профиль успешно обновлен');
            
            // Reload profile to get updated data
            loadProfile();
            
        } catch (error) {
            showError(error.message || 'Не удалось обновить профиль');
        } finally {
            // Restore button state
            submitBtn.prop('disabled', false).html(originalText);
        }
    });
}

// Password form handler
function initPasswordFormHandler() {
    const passwordForm = $('#passwordForm');
    
    // Real-time password strength checking
    passwordForm.find('input[name="new_password"]').on('input', function() {
        checkPasswordStrength(this.value);
    });
    
    // Real-time password confirmation checking
    passwordForm.find('input[name="confirm_password"]').on('input', function() {
        const newPassword = passwordForm.find('input[name="new_password"]').val();
        const confirmPassword = this.value;
        
        if (confirmPassword && newPassword !== confirmPassword) {
            $(this).addClass('is-invalid');
            $(this).siblings('.invalid-feedback').remove();
            $(this).after('<div class="invalid-feedback">Пароли не совпадают</div>');
        } else {
            $(this).removeClass('is-invalid');
            $(this).siblings('.invalid-feedback').remove();
        }
    });
    
    passwordForm.submit(async function(e) {
        e.preventDefault();
        
        const submitBtn = $(this).find('button[type="submit"]');
        const originalText = submitBtn.html();
        
        // Show loading state
        submitBtn.prop('disabled', true)
                 .html('<i class="fas fa-spinner fa-spin me-1"></i>Изменение пароля...');
        
        const formData = {
            current_password: this.current_password.value,
            new_password: this.new_password.value,
            confirm_password: this.confirm_password.value
        };
        
        // Validation
        if (!formData.current_password) {
            showError('Введите текущий пароль');
            submitBtn.prop('disabled', false).html(originalText);
            return;
        }
        
        if (formData.new_password !== formData.confirm_password) {
            showError('Пароли не совпадают');
            submitBtn.prop('disabled', false).html(originalText);
            return;
        }
        
        if (formData.new_password.length < 6) {
            showError('Новый пароль должен содержать минимум 6 символов');
            submitBtn.prop('disabled', false).html(originalText);
            return;
        }
        
        try {
            // Get CSRF token before making the request
            await getCsrfToken();
            
            await apiRequest('/profile/change-password', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            
            showSuccess('Пароль успешно изменен');
            this.reset();
            $('#passwordStrength').html('');
            
            // Clear password fields
            this.current_password.value = '';
            this.new_password.value = '';
            this.confirm_password.value = '';
            
        } catch (error) {
            showError(error.message || 'Не удалось изменить пароль');
        } finally {
            // Restore button state
            submitBtn.prop('disabled', false).html(originalText);
        }
    });
}

// Check password strength
function checkPasswordStrength(password) {
    const strengthDiv = $('#passwordStrength');
    
    if (!password) {
        strengthDiv.html('');
        return;
    }
    
    let score = 0;
    let feedback = [];
    
    // Length check
    if (password.length >= 8) score++;
    else feedback.push('минимум 8 символов');
    
    // Uppercase check
    if (/[A-Z]/.test(password)) score++;
    else feedback.push('заглавная буква');
    
    // Lowercase check
    if (/[a-z]/.test(password)) score++;
    else feedback.push('строчная буква');
    
    // Number check
    if (/\d/.test(password)) score++;
    else feedback.push('цифра');
    
    // Special character check
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
    else feedback.push('специальный символ');
    
    const strength = ['Очень слабый', 'Слабый', 'Средний', 'Хороший', 'Отличный'];
    const colors = ['danger', 'warning', 'info', 'success', 'success'];
    
    const strengthLevel = Math.min(score, 4);
    const progressWidth = ((score + 1) / 5) * 100;
    
    let html = `
        <div class="password-strength-bar">
            <div class="progress" style="height: 4px;">
                <div class="progress-bar bg-${colors[strengthLevel]}" 
                     style="width: ${progressWidth}%"></div>
            </div>
            <small class="text-${colors[strengthLevel]} mt-1 d-block">
                Сила пароля: ${strength[strengthLevel]}
            </small>
        </div>
    `;
    
    if (feedback.length > 0 && score < 4) {
        html += `<small class="text-muted d-block">Добавьте: ${feedback.join(', ')}</small>`;
    }
    
    strengthDiv.html(html);
}

// Load recent activity
async function loadRecentActivity() {
    try {
        // For now, show some placeholder activity
        // In a real app, you'd fetch this from an API
        const activity = [
            {
                action: 'Обновление профиля',
                date: new Date().toISOString(),
                icon: 'user-edit',
                color: 'primary'
            },
            {
                action: 'Вход в систему',
                date: new Date(Date.now() - 86400000).toISOString(),
                icon: 'sign-in-alt',
                color: 'success'
            }
        ];
        
        let html = '';
        
        if (activity.length === 0) {
            html = `
                <div class="text-center text-muted">
                    <i class="fas fa-history fa-2x mb-2"></i>
                    <p class="mb-0">Нет записей об активности</p>
                </div>
            `;
        } else {
            activity.forEach(item => {
                html += `
                    <div class="activity-item d-flex align-items-center mb-3">
                        <div class="activity-icon me-3">
                            <i class="fas fa-${item.icon} text-${item.color}"></i>
                        </div>
                        <div class="flex-grow-1">
                            <div class="activity-action">${item.action}</div>
                            <small class="text-muted">${formatDate(item.date)}</small>
                        </div>
                    </div>
                `;
            });
        }
        
        $('#recentActivity').html(html);
        
    } catch (error) {
        $('#recentActivity').html(`
            <div class="text-center text-muted">
                <i class="fas fa-exclamation-triangle"></i>
                <p class="mb-0">Не удалось загрузить активность</p>
            </div>
        `);
    }
}

// Reset profile form
function resetProfileForm() {
    if (window.originalProfileData) {
        const form = document.getElementById('profileForm');
        form.first_name.value = window.originalProfileData.first_name || '';
        form.last_name.value = window.originalProfileData.last_name || '';
        form.phone.value = window.originalProfileData.phone || '';
        form.birth_date.value = window.originalProfileData.birth_date || '';
        
        showSuccess('Форма сброшена к исходным значениям');
    }
}

// Reset password form
function resetPasswordForm() {
    const form = document.getElementById('passwordForm');
    form.reset();
    $('#passwordStrength').html('');
    $('.is-invalid').removeClass('is-invalid');
    $('.invalid-feedback').remove();
}

// Download user data (GDPR compliance)
async function downloadUserData() {
    try {
        showSuccess('Подготовка данных для скачивания...');
        
        // In a real app, this would call an API endpoint
        // For demo purposes, we'll create a simple JSON file
        const userData = {
            profile: window.originalProfileData,
            export_date: new Date().toISOString(),
            note: 'Это демонстрационный экспорт данных'
        };
        
        const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user_data_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showSuccess('Данные успешно скачаны');
        
    } catch (error) {
        showError('Не удалось скачать данные');
    }
}

// Phone validation helper
function validatePhone(phone) {
    if (!phone) return true; // Phone is optional
    
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Check if it's a valid Russian number
    if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
        return true;
    }
    
    // Check for international format
    if (digits.length >= 10 && digits.length <= 15) {
        return true;
    }
    
    return false;
}

// Helper function to translate roles
function translateRole(role) {
    const roles = {
        'admin': 'Администратор',
        'moderator': 'Модератор',
        'user': 'Пользователь'
    };
    return roles[role] || role;
}