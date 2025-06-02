// Load profile page
async function loadProfile() {
    try {
        const profile = await apiRequest('/profile');
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2>Мой профиль</h2>
                </div>
            </div>
            
            <div class="row">
                <div class="col-md-8">
                    <!-- Profile Information -->
                    <div class="card mb-4">
                        <div class="card-header">
                            <h5>Личная информация</h5>
                        </div>
                        <div class="card-body">
                            <form id="profileForm">
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Имя</label>
                                        <input type="text" class="form-control" name="first_name" 
                                               value="${profile.first_name || ''}" required>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Фамилия</label>
                                        <input type="text" class="form-control" name="last_name" 
                                               value="${profile.last_name || ''}" required>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Телефон</label>
                                        <input type="tel" class="form-control" name="phone" 
                                               value="${profile.phone || ''}" placeholder="+7 (999) 123-45-67">
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Дата рождения</label>
                                        <input type="date" class="form-control" name="birth_date" 
                                               value="${profile.birth_date || ''}">
                                    </div>
                                </div>
                                <button type="submit" class="btn btn-primary">Сохранить изменения</button>
                            </form>
                        </div>
                    </div>
                    
                    <!-- Change Password -->
                    <div class="card mb-4">
                        <div class="card-header">
                            <h5>Изменить пароль</h5>
                        </div>
                        <div class="card-body">
                            <form id="passwordForm">
                                <div class="mb-3">
                                    <label class="form-label">Текущий пароль</label>
                                    <input type="password" class="form-control" name="current_password" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Новый пароль</label>
                                    <input type="password" class="form-control" name="new_password" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Подтвердите новый пароль</label>
                                    <input type="password" class="form-control" name="confirm_password" required>
                                </div>
                                <button type="submit" class="btn btn-warning">Изменить пароль</button>
                            </form>
                        </div>
                    </div>
                </div>
                
                <div class="col-md-4">
                    <!-- Account Info -->
                    <div class="card mb-4">
                        <div class="card-header">
                            <h5>Информация об аккаунте</h5>
                        </div>
                        <div class="card-body">
                            <p class="mb-2"><strong>Имя пользователя:</strong> ${profile.username}</p>
                            <p class="mb-2"><strong>Email:</strong> ${profile.email}</p>
                            <p class="mb-2"><strong>Роль:</strong> ${translateRole(profile.role)}</p>
                            <p class="mb-0"><strong>Дата регистрации:</strong> ${formatDate(profile.created_at)}</p>
                        </div>
                    </div>
                    
                    <!-- Statistics -->
                    <div class="card">
                        <div class="card-header">
                            <h5>Статистика</h5>
                        </div>
                        <div class="card-body">
                            <div class="text-center mb-3">
                                <h3 class="text-primary">${profile.stats.total_bookings}</h3>
                                <p class="text-muted mb-0">Всего бронирований</p>
                            </div>
                            <div class="text-center mb-3">
                                <h3 class="text-success">${formatPrice(profile.stats.total_spent)}</h3>
                                <p class="text-muted mb-0">Общая сумма заказов</p>
                            </div>
                            ${profile.stats.last_booking_date ? `
                                <div class="text-center">
                                    <p class="text-muted mb-1">Последнее бронирование</p>
                                    <p class="mb-0">${formatDate(profile.stats.last_booking_date)}</p>
                                </div>
                            ` : `
                                <div class="text-center">
                                    <p class="text-muted mb-0">Бронирований пока нет</p>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        $('#content').html(html);
        
        // Initialize form handlers
        initProfileFormHandler();
        initPasswordFormHandler();
        
    } catch (error) {
        $('#content').html(`
            <div class="alert alert-danger">
                Произошла ошибка при загрузке профиля. Пожалуйста, попробуйте позже.
            </div>
        `);
    }
}

// Profile form handler
function initProfileFormHandler() {
    $('#profileForm').submit(async function(e) {
        e.preventDefault();
        
        const formData = {
            first_name: this.first_name.value,
            last_name: this.last_name.value,
            phone: this.phone.value || null,
            birth_date: this.birth_date.value || null
        };
        
        try {
            await apiRequest('/profile', {
                method: 'PUT',
                body: JSON.stringify(formData)
            });
            
            showSuccess('Профиль успешно обновлен');
        } catch (error) {
            // Error is handled by apiRequest
        }
    });
}

// Password form handler
function initPasswordFormHandler() {
    $('#passwordForm').submit(async function(e) {
        e.preventDefault();
        
        const currentPassword = this.current_password.value;
        const newPassword = this.new_password.value;
        const confirmPassword = this.confirm_password.value;
        
        if (newPassword !== confirmPassword) {
            showError('Новые пароли не совпадают');
            return;
        }
        
        if (newPassword.length < 6) {
            showError('Пароль должен содержать минимум 6 символов');
            return;
        }
        
        const formData = {
            current_password: currentPassword,
            new_password: newPassword
        };
        
        try {
            await apiRequest('/profile/change-password', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            
            showSuccess('Пароль успешно изменен');
            this.reset();
        } catch (error) {
            // Error is handled by apiRequest
        }
    });
}

// Helper function to translate roles
function translateRole(role) {
    const roles = {
        'user': 'Пользователь',
        'moderator': 'Модератор',
        'admin': 'Администратор'
    };
    return roles[role] || role;
}