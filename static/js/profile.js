// Load profile page
async function loadProfile() {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему для просмотра профиля');
            showLoginModal();
            return;
        }

        console.log('Loading profile...');
        const profile = await apiRequest('/users/me');
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2><i class="fas fa-user me-2"></i>Мой профиль</h2>
                </div>
            </div>
            
            <div class="row">
                <div class="col-lg-4">
                    <!-- Profile Card -->
                    <div class="card mb-4">
                        <div class="card-body text-center">
                            <div class="mb-3">
                                <i class="fas fa-user-circle fa-5x text-primary"></i>
                            </div>
                            <h5 class="card-title mb-0">${profile.username}</h5>
                            <p class="text-muted">${profile.role}</p>
                            <div class="d-grid">
                                <button class="btn btn-primary" onclick="showEditProfileModal()">
                                    <i class="fas fa-edit me-1"></i>Редактировать профиль
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Account Actions -->
                    <div class="card mb-4">
                        <div class="card-header">
                            <h5 class="card-title mb-0">
                                <i class="fas fa-cog me-1"></i>Управление аккаунтом
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="d-grid gap-2">
                                <button class="btn btn-outline-primary" onclick="showChangePasswordModal()">
                                    <i class="fas fa-key me-1"></i>Изменить пароль
                                </button>
                                <button class="btn btn-outline-danger" onclick="showDeleteAccountModal()">
                                    <i class="fas fa-trash me-1"></i>Удалить аккаунт
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-8">
                    <!-- Profile Details -->
                    <div class="card mb-4">
                        <div class="card-header">
                            <h5 class="card-title mb-0">
                                <i class="fas fa-info-circle me-1"></i>Личная информация
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-sm-3">
                                    <p class="mb-0">Имя пользователя</p>
                                </div>
                                <div class="col-sm-9">
                                    <p class="text-muted mb-0">${profile.username}</p>
                                </div>
                            </div>
                            <hr>
                            <div class="row">
                                <div class="col-sm-3">
                                    <p class="mb-0">Email</p>
                                </div>
                                <div class="col-sm-9">
                                    <p class="text-muted mb-0">${profile.email}</p>
                                </div>
                            </div>
                            <hr>
                            <div class="row">
                                <div class="col-sm-3">
                                    <p class="mb-0">Имя</p>
                                </div>
                                <div class="col-sm-9">
                                    <p class="text-muted mb-0">${profile.first_name || 'Не указано'}</p>
                                </div>
                            </div>
                            <hr>
                            <div class="row">
                                <div class="col-sm-3">
                                    <p class="mb-0">Фамилия</p>
                                </div>
                                <div class="col-sm-9">
                                    <p class="text-muted mb-0">${profile.last_name || 'Не указано'}</p>
                                </div>
                            </div>
                            <hr>
                            <div class="row">
                                <div class="col-sm-3">
                                    <p class="mb-0">Роль</p>
                                </div>
                                <div class="col-sm-9">
                                    <p class="text-muted mb-0">${profile.role}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Activity Stats -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">
                                <i class="fas fa-chart-line me-1"></i>Статистика активности
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4 text-center mb-3">
                                    <h6>Бронирований</h6>
                                    <h2>${profile.stats?.total_bookings || 0}</h2>
                                </div>
                                <div class="col-md-4 text-center mb-3">
                                    <h6>Активных</h6>
                                    <h2>${profile.stats?.active_bookings || 0}</h2>
                                </div>
                                <div class="col-md-4 text-center mb-3">
                                    <h6>Отменённых</h6>
                                    <h2>${profile.stats?.cancelled_bookings || 0}</h2>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        $('#content').html(html);
        
    } catch (error) {
        console.error('Failed to load profile:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            $('#content').html(`
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Не удалось загрузить профиль. Пожалуйста, попробуйте позже.
                    <br><small>Ошибка: ${error.message}</small>
                </div>
            `);
        }
    }
}

// Show edit profile modal
function showEditProfileModal() {
    // Check authentication first
    if (!currentUser) {
        showError('Пожалуйста, войдите в систему');
        showLoginModal();
        return;
    }

    const modal = `
        <div class="modal fade" id="editProfileModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-edit me-2"></i>Редактировать профиль
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="editProfileForm">
                            <div class="mb-3">
                                <label class="form-label">Email</label>
                                <input type="email" class="form-control" name="email" 
                                       value="${currentUser.email}" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Имя</label>
                                <input type="text" class="form-control" name="first_name" 
                                       value="${currentUser.first_name || ''}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Фамилия</label>
                                <input type="text" class="form-control" name="last_name" 
                                       value="${currentUser.last_name || ''}">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            Отмена
                        </button>
                        <button type="button" class="btn btn-primary" onclick="updateProfile()">
                            <i class="fas fa-save me-1"></i>Сохранить
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    $('#editProfileModal').remove();
    
    // Add new modal to DOM and show it
    $('body').append(modal);
    $('#editProfileModal').modal('show');
}

// Update profile
async function updateProfile() {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему');
            showLoginModal();
            return;
        }

        const form = document.getElementById('editProfileForm');
        const formData = new FormData(form);
        
        const response = await apiRequest('/users/me', {
            method: 'PUT',
            body: JSON.stringify({
                email: formData.get('email'),
                first_name: formData.get('first_name'),
                last_name: formData.get('last_name')
            })
        });
        
        if (response) {
            // Update current user data
            currentUser = {
                ...currentUser,
                email: response.email,
                first_name: response.first_name,
                last_name: response.last_name
            };
            
            // Close modal and reload profile
            $('#editProfileModal').modal('hide');
            showSuccess('Профиль успешно обновлен');
            loadProfile();
        }
    } catch (error) {
        console.error('Update profile error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Не удалось обновить профиль');
        }
    }
}

// Show change password modal
function showChangePasswordModal() {
    // Check authentication first
    if (!currentUser) {
        showError('Пожалуйста, войдите в систему');
        showLoginModal();
        return;
    }

    const modal = `
        <div class="modal fade" id="changePasswordModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-key me-2"></i>Изменить пароль
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="changePasswordForm">
                            <div class="mb-3">
                                <label class="form-label">Текущий пароль</label>
                                <input type="password" class="form-control" name="current_password" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Новый пароль</label>
                                <input type="password" class="form-control" name="new_password" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Подтверждение нового пароля</label>
                                <input type="password" class="form-control" name="confirm_password" required>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            Отмена
                        </button>
                        <button type="button" class="btn btn-primary" onclick="changePassword()">
                            <i class="fas fa-save me-1"></i>Изменить пароль
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    $('#changePasswordModal').remove();
    
    // Add new modal to DOM and show it
    $('body').append(modal);
    $('#changePasswordModal').modal('show');
}

// Change password
async function changePassword() {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему');
            showLoginModal();
            return;
        }

        const form = document.getElementById('changePasswordForm');
        const formData = new FormData(form);
        
        const newPassword = formData.get('new_password');
        const confirmPassword = formData.get('confirm_password');
        
        if (newPassword !== confirmPassword) {
            showError('Пароли не совпадают');
            return;
        }
        
        await apiRequest('/users/me/password', {
            method: 'PUT',
            body: JSON.stringify({
                current_password: formData.get('current_password'),
                new_password: newPassword
            })
        });
        
        // Close modal and show success message
        $('#changePasswordModal').modal('hide');
        showSuccess('Пароль успешно изменен');
        
    } catch (error) {
        console.error('Change password error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Не удалось изменить пароль');
        }
    }
}

// Show delete account modal
function showDeleteAccountModal() {
    // Check authentication first
    if (!currentUser) {
        showError('Пожалуйста, войдите в систему');
        showLoginModal();
        return;
    }

    const modal = `
        <div class="modal fade" id="deleteAccountModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-exclamation-triangle me-2"></i>Удаление аккаунта
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-danger">
                            <strong>Внимание!</strong> Это действие необратимо.
                            Все ваши данные будут удалены.
                        </div>
                        <form id="deleteAccountForm">
                            <div class="mb-3">
                                <label class="form-label">Введите пароль для подтверждения</label>
                                <input type="password" class="form-control" name="password" required>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            Отмена
                        </button>
                        <button type="button" class="btn btn-danger" onclick="deleteAccount()">
                            <i class="fas fa-trash me-1"></i>Удалить аккаунт
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    $('#deleteAccountModal').remove();
    
    // Add new modal to DOM and show it
    $('body').append(modal);
    $('#deleteAccountModal').modal('show');
}

// Delete account
async function deleteAccount() {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему');
            showLoginModal();
            return;
        }

        const form = document.getElementById('deleteAccountForm');
        const formData = new FormData(form);
        
        await apiRequest('/users/me', {
            method: 'DELETE',
            body: JSON.stringify({
                password: formData.get('password')
            })
        });
        
        // Logout after account deletion
        await logout();
        
        // Show success message and redirect to home
        showSuccess('Аккаунт успешно удален');
        navigateTo('events');
        
    } catch (error) {
        console.error('Delete account error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Не удалось удалить аккаунт');
        }
    }
}