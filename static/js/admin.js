// Load admin panel
async function loadAdminPanel() {
    try {
        const [users, stats] = await Promise.all([
            apiRequest('/admin/users'),
            apiRequest('/admin/stats')
        ]);
        
        let html = `
            <div class="admin-header">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="admin-title">Панель управления</h2>
                        <p class="text-muted mb-0">Управление системой бронирования</p>
                    </div>
                    <div class="col-auto">
                        <button class="btn btn-primary" onclick="navigateTo('events')">
                            <i class="fas fa-plus me-1"></i>Создать мероприятие
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Statistics Overview -->
            <div class="admin-stats">
                <div class="stats-card">
                    <h3>Всего пользователей</h3>
                    <h2>${stats.overall.total_users}</h2>
                    <div class="trend trend-up">
                        <i class="fas fa-arrow-up me-1"></i>
                        <span>Активные аккаунты</span>
                    </div>
                </div>
                <div class="stats-card">
                    <h3>Всего мероприятий</h3>
                    <h2>${stats.overall.total_events}</h2>
                    <div class="trend trend-up">
                        <i class="fas fa-calendar-alt me-1"></i>
                        <span>Запланировано</span>
                    </div>
                </div>
                <div class="stats-card">
                    <h3>Всего бронирований</h3>
                    <h2>${stats.overall.total_bookings}</h2>
                    <div class="trend trend-up">
                        <i class="fas fa-ticket-alt me-1"></i>
                        <span>Подтверждено</span>
                    </div>
                </div>
                <div class="stats-card">
                    <h3>Общая выручка</h3>
                    <h2>${formatPrice(stats.overall.total_revenue)}</h2>
                    <div class="trend trend-up">
                        <i class="fas fa-ruble-sign me-1"></i>
                        <span>Получено</span>
                    </div>
                </div>
            </div>
            
            <!-- Upcoming Events Stats -->
            <div class="row mb-4">
                <div class="col-lg-8">
                    <div class="card admin-card">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="fas fa-chart-line me-2"></i>Статистика предстоящих мероприятий
                            </h5>
                        </div>
                        <div class="card-body">
                            ${stats.upcoming_events.length > 0 ? `
                                <div class="table-responsive">
                                    <table class="table admin-table">
                                        <thead>
                                            <tr>
                                                <th>Мероприятие</th>
                                                <th>Бронирований</th>
                                                <th>Вместимость</th>
                                                <th>Заполненность</th>
                                                <th>Действия</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${stats.upcoming_events.map(event => `
                                                <tr>
                                                    <td>
                                                        <strong>${event.title}</strong>
                                                    </td>
                                                    <td>
                                                        <span class="badge bg-primary">${event.total_bookings}</span>
                                                    </td>
                                                    <td>${event.capacity}</td>
                                                    <td>
                                                        <div class="progress mb-1" style="height: 6px;">
                                                            <div class="progress-bar ${event.booking_percentage > 80 ? 'bg-warning' : event.booking_percentage > 50 ? 'bg-info' : 'bg-success'}" 
                                                                 role="progressbar" style="width: ${event.booking_percentage}%">
                                                            </div>
                                                        </div>
                                                        <small class="text-muted">${event.booking_percentage}%</small>
                                                    </td>
                                                    <td>
                                                        <div class="action-buttons">
                                                            <button class="btn btn-sm btn-outline-primary btn-icon" 
                                                                    onclick="viewEventDetails(${event.event_id})"
                                                                    title="Просмотр">
                                                                <i class="fas fa-eye"></i>
                                                            </button>
                                                            <button class="btn btn-sm btn-outline-secondary btn-icon" 
                                                                    onclick="editEvent(${event.event_id})"
                                                                    title="Редактировать">
                                                                <i class="fas fa-edit"></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : `
                                <div class="text-center py-4">
                                    <i class="fas fa-calendar-times fa-3x text-muted mb-3"></i>
                                    <h5 class="text-muted">Нет предстоящих мероприятий</h5>
                                    <p class="text-muted mb-3">Создайте новое мероприятие для начала работы</p>
                                    <button class="btn btn-primary" onclick="navigateTo('events')">
                                        <i class="fas fa-plus me-1"></i>Создать мероприятие
                                    </button>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
                <div class="col-lg-4">
                    <!-- Category Stats -->
                    <div class="card admin-card">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="fas fa-tags me-2"></i>Статистика по категориям
                            </h5>
                        </div>
                        <div class="card-body">
                            ${stats.categories.length > 0 ? `
                                <div class="category-stats">
                                    ${stats.categories.map(category => `
                                        <div class="category-item mb-3">
                                            <div class="d-flex justify-content-between align-items-center mb-1">
                                                <span class="fw-medium">${category.category || 'Без категории'}</span>
                                                <span class="badge bg-secondary">${category.total_events}</span>
                                            </div>
                                            <div class="row text-center">
                                                <div class="col-6">
                                                    <small class="text-muted d-block">Бронирований</small>
                                                    <strong class="text-primary">${category.total_bookings}</strong>
                                                </div>
                                                <div class="col-6">
                                                    <small class="text-muted d-block">Выручка</small>
                                                    <strong class="text-success">${formatPrice(category.revenue)}</strong>
                                                </div>
                                            </div>
                                            <hr class="mt-2 mb-0">
                                        </div>
                                    `).join('')}
                                </div>
                            ` : `
                                <div class="text-center py-3">
                                    <i class="fas fa-tags fa-2x text-muted mb-2"></i>
                                    <p class="text-muted mb-0">Нет данных по категориям</p>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- User Management -->
            <div class="row">
                <div class="col">
                    <div class="card admin-card">
                        <div class="card-header">
                            <div class="row align-items-center">
                                <div class="col">
                                    <h5 class="card-title">
                                        <i class="fas fa-users me-2"></i>Управление пользователями
                                    </h5>
                                </div>
                                <div class="col-auto">
                                    <div class="admin-filters-inline">
                                        <div class="input-group input-group-sm">
                                            <input type="text" class="form-control" placeholder="Поиск пользователей..." 
                                                   id="userSearch" onkeyup="filterUsers()">
                                            <button class="btn btn-outline-secondary" type="button" onclick="clearUserSearch()">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table admin-table" id="usersTable">
                                    <thead>
                                        <tr>
                                            <th>Пользователь</th>
                                            <th>Контакты</th>
                                            <th>Роль</th>
                                            <th>Статус</th>
                                            <th>Регистрация</th>
                                            <th>Действия</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${users.map(user => `
                                            <tr data-user-id="${user.user_id}">
                                                <td>
                                                    <div class="user-info">
                                                        <div class="user-avatar me-2">
                                                            <i class="fas fa-user"></i>
                                                        </div>
                                                        <div>
                                                            <strong>${user.username}</strong>
                                                            <br>
                                                            <small class="text-muted">${user.first_name || ''} ${user.last_name || ''}</small>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div>
                                                        <i class="fas fa-envelope me-1 text-muted"></i>
                                                        <small>${user.email}</small>
                                                    </div>
                                                </td>
                                                <td>
                                                    <select class="form-select form-select-sm role-selector" 
                                                            onchange="updateUserRole(${user.user_id}, this.value)"
                                                            ${user.user_id === currentUser.user_id ? 'disabled' : ''}>
                                                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>Пользователь</option>
                                                        <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Модератор</option>
                                                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Администратор</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <div class="form-check form-switch">
                                                        <input class="form-check-input" type="checkbox"
                                                               ${user.is_active ? 'checked' : ''}
                                                               onchange="updateUserStatus(${user.user_id}, this.checked)"
                                                               ${user.user_id === currentUser.user_id ? 'disabled' : ''}>
                                                        <label class="form-check-label">
                                                            <span class="status-badge ${user.is_active ? 'status-active' : 'status-inactive'}">
                                                                ${user.is_active ? 'Активен' : 'Неактивен'}
                                                            </span>
                                                        </label>
                                                    </div>
                                                </td>
                                                <td>
                                                    <small class="text-muted">${formatDate(user.created_at)}</small>
                                                </td>
                                                <td>
                                                    <div class="action-buttons">
                                                        <button class="btn btn-sm btn-outline-info btn-icon" 
                                                                onclick="showUserDetails(${user.user_id})"
                                                                title="Детали">
                                                            <i class="fas fa-info"></i>
                                                        </button>
                                                        <button class="btn btn-sm btn-outline-primary btn-icon" 
                                                                onclick="showUserActivity(${user.user_id})"
                                                                title="Активность">
                                                            <i class="fas fa-history"></i>
                                                        </button>
                                                        ${user.user_id !== currentUser.user_id ? `
                                                            <button class="btn btn-sm btn-outline-warning btn-icon" 
                                                                    onclick="resetUserPassword(${user.user_id})"
                                                                    title="Сбросить пароль">
                                                                <i class="fas fa-key"></i>
                                                            </button>
                                                        ` : ''}
                                                    </div>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                            
                            ${users.length === 0 ? `
                                <div class="text-center py-4">
                                    <i class="fas fa-users fa-3x text-muted mb-3"></i>
                                    <h5 class="text-muted">Нет пользователей</h5>
                                    <p class="text-muted">Пользователи появятся после регистрации</p>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        $('#content').html(html);
        
        // Store users data for filtering
        window.usersData = users;
        
    } catch (error) {
        $('#content').html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Произошла ошибка при загрузке панели управления. Пожалуйста, попробуйте позже.
            </div>
        `);
    }
}

// Filter users
function filterUsers() {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#usersTable tbody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const show = text.includes(searchTerm);
        row.style.display = show ? '' : 'none';
    });
}

// Clear user search
function clearUserSearch() {
    document.getElementById('userSearch').value = '';
    filterUsers();
}

// Update user role
async function updateUserRole(userId, role) {
    const selectElement = event.target;
    const originalValue = selectElement.dataset.originalValue || selectElement.value;
    
    if (!confirm(`Вы уверены, что хотите изменить роль пользователя на "${translateRole(role)}"?`)) {
        selectElement.value = originalValue;
        return;
    }
    
    try {
        selectElement.disabled = true;
        selectElement.dataset.originalValue = originalValue;
        
        await apiRequest(`/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ role })
        });
        
        showSuccess('Роль пользователя успешно обновлена');
        selectElement.dataset.originalValue = role;
        
    } catch (error) {
        selectElement.value = originalValue;
        showError(error.message || 'Не удалось обновить роль пользователя');
    } finally {
        selectElement.disabled = false;
    }
}

// Update user status
async function updateUserStatus(userId, isActive) {
    const checkboxElement = event.target;
    const originalValue = !isActive;
    
    if (!confirm(`Вы уверены, что хотите ${isActive ? 'активировать' : 'деактивировать'} этого пользователя?`)) {
        checkboxElement.checked = originalValue;
        return;
    }
    
    try {
        checkboxElement.disabled = true;
        
        await apiRequest(`/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ is_active: isActive })
        });
        
        showSuccess('Статус пользователя успешно обновлен');
        
        // Update status badge
        const statusBadge = checkboxElement.parentElement.querySelector('.status-badge');
        if (statusBadge) {
            statusBadge.className = `status-badge ${isActive ? 'status-active' : 'status-inactive'}`;
            statusBadge.textContent = isActive ? 'Активен' : 'Неактивен';
        }
        
    } catch (error) {
        checkboxElement.checked = originalValue;
        showError(error.message || 'Не удалось обновить статус пользователя');
    } finally {
        checkboxElement.disabled = false;
    }
}

// Show user details
async function showUserDetails(userId) {
    try {
        const user = await apiRequest(`/admin/users/${userId}`);
        
        const html = `
            <div class="modal fade" id="userDetailsModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-user me-2"></i>Детали пользователя
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6 class="card-title">
                                                <i class="fas fa-info-circle me-1"></i>Основная информация
                                            </h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="info-item">
                                                <strong>Имя пользователя:</strong>
                                                <p class="text-muted">${user.username}</p>
                                            </div>
                                            <div class="info-item">
                                                <strong>Email:</strong>
                                                <p class="text-muted">${user.email}</p>
                                            </div>
                                            <div class="info-item">
                                                <strong>ФИО:</strong>
                                                <p class="text-muted">${user.first_name || 'Не указано'} ${user.last_name || ''}</p>
                                            </div>
                                            <div class="info-item">
                                                <strong>Телефон:</strong>
                                                <p class="text-muted">${user.phone || 'Не указан'}</p>
                                            </div>
                                            <div class="info-item">
                                                <strong>Дата рождения:</strong>
                                                <p class="text-muted">${user.birth_date ? formatDate(user.birth_date) : 'Не указана'}</p>
                                            </div>
                                            <div class="info-item">
                                                <strong>Роль:</strong>
                                                <span class="badge bg-primary">${translateRole(user.role)}</span>
                                            </div>
                                            <div class="info-item">
                                                <strong>Статус:</strong>
                                                <span class="status-badge ${user.is_active ? 'status-active' : 'status-inactive'}">
                                                    ${user.is_active ? 'Активен' : 'Неактивен'}
                                                </span>
                                            </div>
                                            <div class="info-item">
                                                <strong>Дата регистрации:</strong>
                                                <p class="text-muted">${formatDate(user.created_at)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6 class="card-title">
                                                <i class="fas fa-chart-bar me-1"></i>Статистика активности
                                            </h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="stat-item text-center mb-3">
                                                <div class="stat-number text-primary">
                                                    ${user.stats.total_bookings}
                                                </div>
                                                <div class="stat-label">
                                                    Всего бронирований
                                                </div>
                                            </div>
                                            <div class="stat-item text-center mb-3">
                                                <div class="stat-number text-success">
                                                    ${formatPrice(user.stats.total_spent)}
                                                </div>
                                                <div class="stat-label">
                                                    Общая сумма заказов
                                                </div>
                                            </div>
                                            <div class="stat-item text-center">
                                                <div class="stat-label mb-1">
                                                    Последняя активность
                                                </div>
                                                <div class="stat-date">
                                                    ${user.stats.last_activity ? formatDate(user.stats.last_activity) : 'Никогда'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                Закрыть
                            </button>
                            ${user.user_id !== currentUser.user_id ? `
                                <button type="button" class="btn btn-warning" onclick="resetUserPassword(${user.user_id})">
                                    <i class="fas fa-key me-1"></i>Сбросить пароль
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        $('#userDetailsModal').remove();
        
        // Add new modal to DOM and show it
        $('body').append(html);
        $('#userDetailsModal').modal('show');
        
    } catch (error) {
        showError('Не удалось загрузить детали пользователя');
    }
}

// Show user activity
async function showUserActivity(userId) {
    showSuccess('Функция просмотра активности пользователя будет добавлена в следующей версии');
}

// Reset user password
async function resetUserPassword(userId) {
    if (!confirm('Вы уверены, что хотите сбросить пароль этого пользователя? Будет создан временный пароль.')) {
        return;
    }
    
    try {
        // This would be implemented in the backend
        showSuccess('Функция сброса пароля будет добавлена в следующей версии');
    } catch (error) {
        showError('Не удалось сбросить пароль пользователя');
    }
}

// View event details
function viewEventDetails(eventId) {
    // Navigate to events page and highlight specific event
    navigateTo('events');
    setTimeout(() => {
        // This would scroll to and highlight the specific event
        showSuccess(`Просмотр мероприятия с ID: ${eventId}`);
    }, 500);
}

// Edit event
function editEvent(eventId) {
    // Navigate to events page and trigger edit modal
    navigateTo('events');
    setTimeout(() => {
        // This would trigger the edit modal for the specific event
        if (typeof showEditEventModal === 'function') {
            showEditEventModal(eventId);
        }
    }, 500);
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

// CSS for user avatar in admin panel
const additionalCSS = `
<style>
.user-info {
    display: flex;
    align-items: center;
}

.user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 12px;
}

.info-item {
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid #f1f3f4;
}

.info-item:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
}

.info-item strong {
    display: block;
    margin-bottom: 4px;
    color: #495057;
    font-size: 14px;
}

.info-item p {
    margin: 0;
    font-size: 14px;
}

.category-item {
    padding: 12px 0;
}

.admin-filters-inline {
    max-width: 250px;
}

.role-selector {
    min-width: 120px;
}

@media (max-width: 768px) {
    .admin-filters-inline {
        max-width: 100%;
        margin-top: 12px;
    }
    
    .user-info {
        flex-direction: column;
        align-items: flex-start;
    }
    
    .user-avatar {
        margin-bottom: 8px;
    }
    
    .action-buttons {
        flex-direction: column;
        gap: 4px;
    }
    
    .btn-icon {
        width: 100%;
        justify-content: flex-start;
    }
    
    .btn-icon i {
        margin-right: 8px;
    }
}
</style>
`;

// Add CSS to head if not already added
if (!document.querySelector('#admin-additional-css')) {
    const style = document.createElement('div');
    style.id = 'admin-additional-css';
    style.innerHTML = additionalCSS;
    document.head.appendChild(style);
}