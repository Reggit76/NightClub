// Fixed admin.js with better error handling and role checks
// Load admin panel with proper error handling
async function loadAdminPanel() {
    try {
        console.log('Loading admin panel...');
        
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему');
            showLoginModal();
            return;
        }

        // Verify user has proper permissions
        if (!['admin', 'moderator'].includes(currentUser.role)) {
            $('#content').html(`
                <div class="alert alert-danger text-center">
                    <i class="fas fa-ban fa-3x mb-3"></i>
                    <h4>Доступ запрещен</h4>
                    <p>У вас нет прав для просмотра административной панели.</p>
                    <p>Текущая роль: <strong>${currentUser.role}</strong></p>
                    <button class="btn btn-primary" onclick="navigateTo('events')">
                        <i class="fas fa-arrow-left me-1"></i>Вернуться к мероприятиям
                    </button>
                </div>
            `);
            return;
        }

        // Show loading
        $('#content').html(`
            <div class="d-flex justify-content-center align-items-center" style="min-height: 300px;">
                <div class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Загрузка...</span>
                    </div>
                    <p class="mt-3 text-muted">Загрузка панели управления...</p>
                </div>
            </div>
        `);

        let users = [];
        let stats = null;
        
        try {
            console.log('Fetching admin data...');
            
            // Try to load users
            try {
                users = await apiRequest('/admin/users');
                console.log('Users loaded:', users.length);
            } catch (error) {
                console.error('Failed to load users:', error);
                // Continue without users data
                users = [];
            }
            
            // Try to load stats
            try {
                stats = await apiRequest('/admin/stats');
                console.log('Stats loaded:', stats);
            } catch (error) {
                console.error('Failed to load stats:', error);
                // Continue with empty stats
                stats = {
                    overall: {
                        total_users: 0,
                        total_events: 0,
                        total_bookings: 0,
                        total_revenue: 0
                    },
                    upcoming_events: [],
                    categories: [],
                    zones: []
                };
            }
            
        } catch (error) {
            console.error('Critical error loading admin data:', error);
            $('#content').html(`
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>Ошибка загрузки панели управления</strong>
                    <p class="mb-2">Не удалось загрузить данные административной панели.</p>
                    <details>
                        <summary>Подробности ошибки</summary>
                        <pre class="mt-2">${error.message}</pre>
                    </details>
                    <button class="btn btn-primary mt-2" onclick="loadAdminPanel()">
                        <i class="fas fa-redo me-1"></i>Попробовать снова
                    </button>
                </div>
            `);
            return;
        }
        
        // Check if current user is admin (full access) or moderator (limited access)
        const isAdmin = currentUser.role === 'admin';
        const isModerator = currentUser.role === 'moderator';
        
        let html = `
            <div class="admin-header">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="admin-title">
                            <i class="fas fa-tachometer-alt me-2"></i>Панель управления
                        </h2>
                        <p class="text-muted mb-0">
                            ${isAdmin ? 'Полный доступ администратора' : 'Доступ модератора'}
                        </p>
                    </div>
                    <div class="col-auto">
                        ${isAdmin ? `
                            <div class="btn-group">
                                <button class="btn btn-info me-2" onclick="showAuditLogsModal()">
                                    <i class="fas fa-history me-1"></i>Журнал действий
                                </button>
                                <button class="btn btn-success me-2" onclick="showSystemHealthModal()">
                                    <i class="fas fa-heartbeat me-1"></i>Состояние системы
                                </button>
                                <button class="btn btn-primary" onclick="navigateTo('events')">
                                    <i class="fas fa-plus me-1"></i>Создать мероприятие
                                </button>
                            </div>
                        ` : `
                        <button class="btn btn-primary" onclick="navigateTo('events')">
                            <i class="fas fa-plus me-1"></i>Создать мероприятие
                        </button>
                        `}
                    </div>
                </div>
            </div>
            
            <!-- Role-based access notice -->
            ${isModerator ? `
                <div class="alert alert-info mb-4">
                    <i class="fas fa-info-circle me-2"></i>
                    <strong>Права модератора:</strong> Вы можете управлять пользователями (кроме администраторов) 
                    и просматривать статистику. Доступ к логам и системным функциям ограничен.
                </div>
            ` : ''}
            
            <!-- Statistics Overview -->
            <div class="admin-stats">
                <div class="stats-card">
                    <h3>Всего пользователей</h3>
                    <h2 class="text-primary">${stats.overall.total_users || users.length}</h2>
                    <div class="trend trend-up">
                        <i class="fas fa-users me-1"></i>
                        <span>Активные аккаунты</span>
                    </div>
                </div>
                <div class="stats-card">
                    <h3>Предстоящие мероприятия</h3>
                    <h2 class="text-info">${stats.overall.total_events || 0}</h2>
                    <div class="trend trend-up">
                        <i class="fas fa-calendar-alt me-1"></i>
                        <span>Запланировано</span>
                    </div>
                </div>
                <div class="stats-card">
                    <h3>Подтвержденные бронирования</h3>
                    <h2 class="text-success">${stats.overall.total_bookings || 0}</h2>
                    <div class="trend trend-up">
                        <i class="fas fa-ticket-alt me-1"></i>
                        <span>Подтверждено</span>
                    </div>
                </div>
                <div class="stats-card">
                    <h3>Общая выручка</h3>
                    <h2 class="text-warning">${formatPrice(stats.overall.total_revenue || 0)}</h2>
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
                            <div class="d-flex justify-content-between align-items-center">
                            <h5 class="card-title">
                                    <i class="fas fa-chart-line me-2"></i>Предстоящие мероприятия
                            </h5>
                                <span class="badge bg-primary">${stats.upcoming_events.length} мероприятий</span>
                            </div>
                        </div>
                        <div class="card-body">
                            ${stats.upcoming_events.length > 0 ? `
                                <div class="table-responsive">
                                    <table class="table admin-table">
                                        <thead>
                                            <tr>
                                                <th>Мероприятие</th>
                                                <th>Дата</th>
                                                <th>Бронирований</th>
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
                                                        <small class="text-muted">${formatDate(event.event_date)}</small>
                                                    </td>
                                                    <td>
                                                        <span class="badge bg-primary">${event.total_bookings || 0}</span>
                                                        <span class="text-muted">/ ${event.capacity || 0}</span>
                                                    </td>
                                                    <td>
                                                        <div class="progress mb-1" style="height: 6px;">
                                                            <div class="progress-bar ${(event.booking_percentage || 0) > 80 ? 'bg-warning' : (event.booking_percentage || 0) > 50 ? 'bg-info' : 'bg-success'}" 
                                                                 role="progressbar" style="width: ${event.booking_percentage || 0}%">
                                                            </div>
                                                        </div>
                                                        <small class="text-muted">${event.booking_percentage || 0}%</small>
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
                    <div class="card admin-card mb-4">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="fas fa-tags me-2"></i>По категориям
                            </h5>
                        </div>
                        <div class="card-body">
                            ${stats.categories.length > 0 ? `
                                <div class="category-stats">
                                    ${stats.categories.slice(0, 5).map(category => `
                                        <div class="category-item mb-3">
                                            <div class="d-flex justify-content-between align-items-center mb-1">
                                                <span class="fw-medium">${category.category || 'Без категории'}</span>
                                                <span class="badge bg-secondary">${category.total_events || 0}</span>
                                            </div>
                                            <div class="row text-center">
                                                <div class="col-6">
                                                    <small class="text-muted d-block">Бронирований</small>
                                                    <strong class="text-primary">${category.total_bookings || 0}</strong>
                                                </div>
                                                <div class="col-6">
                                                    <small class="text-muted d-block">Выручка</small>
                                                    <strong class="text-success">${formatPrice(category.revenue || 0)}</strong>
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
                    
                    <!-- Zone Stats (if available) -->
                    ${stats.zones && stats.zones.length > 0 ? `
                        <div class="card admin-card">
                            <div class="card-header">
                                <h5 class="card-title">
                                    <i class="fas fa-map-marked-alt me-2"></i>Популярные зоны
                                </h5>
                            </div>
                            <div class="card-body">
                                ${stats.zones.slice(0, 4).map(zone => `
                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                        <span class="fw-medium">${zone.zone_name}</span>
                                        <div class="text-end">
                                            <small class="text-muted d-block">${zone.events_using_zone || 0} мероприятий</small>
                                            <small class="text-success">${formatPrice(zone.avg_price || 0)} средняя цена</small>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
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
                                    <small class="text-muted">
                                        ${isAdmin ? 'Полные права на изменение ролей и статусов' : 
                                           'Ограниченные права - нельзя изменять администраторов'}
                                    </small>
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
                            ${users.length > 0 ? `
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
                                            ${users.map(user => {
                                                const canModifyUser = isAdmin || (isModerator && user.role !== 'admin');
                                                const canChangeRole = isAdmin;
                                                const isSelf = user.user_id === currentUser.user_id;
                                                
                                                return `
                                                    <tr data-user-id="${user.user_id}" ${!canModifyUser ? 'class="table-secondary"' : ''}>
                                                    <td>
                                                        <div class="user-info">
                                                            <div class="user-avatar me-2">
                                                                <i class="fas fa-user"></i>
                                                            </div>
                                                            <div>
                                                                <strong>${user.username}</strong>
                                                                    ${isSelf ? '<span class="badge bg-info ms-1">Вы</span>' : ''}
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
                                                            ${canChangeRole && !isSelf ? `
                                                        <select class="form-select form-select-sm role-selector" 
                                                                        onchange="updateUserRole(${user.user_id}, this.value)">
                                                            <option value="user" ${user.role === 'user' ? 'selected' : ''}>Пользователь</option>
                                                            <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Модератор</option>
                                                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Администратор</option>
                                                        </select>
                                                            ` : `
                                                            <span class="badge ${user.role === 'admin' ? 'bg-danger' : user.role === 'moderator' ? 'bg-warning' : 'bg-info'}">
                                                                ${translateRole(user.role)}
                                                                ${!canModifyUser && user.role === 'admin' ? 
                                                                  '<i class="fas fa-lock ms-1" title="Недоступно для модераторов"></i>' : ''}
                                                            </span>
                                                        `}
                                                    </td>
                                                    <td>
                                                            ${canModifyUser && !isSelf ? `
                                                        <div class="form-check form-switch">
                                                            <input class="form-check-input" type="checkbox"
                                                                   ${user.is_active ? 'checked' : ''}
                                                                           onchange="updateUserStatus(${user.user_id}, this.checked)">
                                                            <label class="form-check-label">
                                                                <span class="status-badge ${user.is_active ? 'status-active' : 'status-inactive'}">
                                                                    ${user.is_active ? 'Активен' : 'Неактивен'}
                                                                </span>
                                                            </label>
                                                        </div>
                                                            ` : `
                                                            <span class="status-badge ${user.is_active ? 'status-active' : 'status-inactive'}">
                                                                ${user.is_active ? 'Активен' : 'Неактивен'}
                                                            </span>
                                                        `}
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
                                                                ${canModifyUser ? `
                                                            <button class="btn btn-sm btn-outline-primary btn-icon" 
                                                                    onclick="showUserActivity(${user.user_id})"
                                                                    title="Активность">
                                                                <i class="fas fa-history"></i>
                                                            </button>
                                                                ` : `
                                                                    <button class="btn btn-sm btn-outline-secondary btn-icon" 
                                                                            disabled title="Недоступно">
                                                                        <i class="fas fa-lock"></i>
                                                                </button>
                                                                `}
                                                        </div>
                                                    </td>
                                                </tr>
                                                `;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : `
                                <div class="text-center py-4">
                                    <i class="fas fa-users fa-3x text-muted mb-3"></i>
                                    <h5 class="text-muted">Нет пользователей</h5>
                                    <p class="text-muted">Данные пользователей недоступны</p>
                                    <button class="btn btn-primary" onclick="loadAdminPanel()">
                                        <i class="fas fa-redo me-1"></i>Обновить
                                    </button>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Admin-only sections -->
            ${isAdmin ? `
                <div class="row mt-4">
                    <div class="col">
                        <div class="card admin-card">
                            <div class="card-header">
                                <h5 class="card-title">
                                    <i class="fas fa-tools me-2"></i>Системные инструменты
                                    <span class="badge bg-danger ms-2">Только для администраторов</span>
                                </h5>
                            </div>
                            <div class="card-body">
                                <div class="row">
                                    <div class="col-md-4">
                                        <button class="btn btn-outline-primary w-100 mb-2" onclick="showSystemHealthModal()">
                                            <i class="fas fa-heartbeat me-1"></i>Состояние системы
                                        </button>
                                    </div>
                                    <div class="col-md-4">
                                        <button class="btn btn-outline-info w-100 mb-2" onclick="exportSystemData()">
                                            <i class="fas fa-download me-1"></i>Экспорт данных
                                        </button>
                                    </div>
                                    <div class="col-md-4">
                                        <button class="btn btn-outline-warning w-100 mb-2" onclick="cleanupSystem()">
                                            <i class="fas fa-broom me-1"></i>Очистка системы
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
        
        $('#content').html(html);
        
        // Store users data for filtering
        window.usersData = users;
        window.currentUserRole = currentUser.role;
        
        console.log('Admin panel loaded successfully');
        
    } catch (error) {
        console.error('Critical admin panel error:', error);
        $('#content').html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Критическая ошибка</strong>
                <p class="mb-2">Не удалось загрузить панель управления.</p>
                <details>
                    <summary>Подробности ошибки</summary>
                    <pre class="mt-2">${error.message}</pre>
                </details>
                <button class="btn btn-primary mt-2" onclick="loadAdminPanel()">
                    <i class="fas fa-redo me-1"></i>Попробовать снова
                </button>
                <button class="btn btn-secondary mt-2 ms-2" onclick="navigateTo('events')">
                    <i class="fas fa-arrow-left me-1"></i>Вернуться к мероприятиям
                </button>
            </div>
        `);
    }
}

// Helper functions for user management
async function updateUserRole(userId, newRole) {
    try {
        if (!currentUser || currentUser.role !== 'admin') {
            showError('У вас нет прав для изменения ролей');
            return;
        }

        await apiRequest(`/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ role: newRole })
        });
        
        showSuccess('Роль пользователя успешно изменена');
        // Reload to update display
        setTimeout(() => loadAdminPanel(), 1000);
        
    } catch (error) {
        console.error('Update user role error:', error);
        showError(error.message || 'Не удалось изменить роль пользователя');
        // Revert select
        loadAdminPanel();
    }
}

async function updateUserStatus(userId, isActive) {
    try {
        if (!currentUser || !['admin', 'moderator'].includes(currentUser.role)) {
            showError('У вас нет прав для изменения статуса пользователей');
            return;
        }

        await apiRequest(`/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ is_active: isActive })
        });
        
        showSuccess(`Пользователь ${isActive ? 'активирован' : 'деактивирован'}`);
        
    } catch (error) {
        console.error('Update user status error:', error);
        showError(error.message || 'Не удалось изменить статус пользователя');
        // Revert checkbox
        loadAdminPanel();
    }
}

function showUserDetails(userId) {
    showError('Функция просмотра деталей пользователя будет реализована');
}

function showUserActivity(userId) {
    showError('Функция просмотра активности пользователя будет реализована');
}

function filterUsers() {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#usersTable tbody tr');
    
    rows.forEach(row => {
        const username = row.querySelector('strong').textContent.toLowerCase();
        const email = row.querySelector('.fa-envelope').parentElement.textContent.toLowerCase();
        
        if (username.includes(searchTerm) || email.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function clearUserSearch() {
    document.getElementById('userSearch').value = '';
    filterUsers();
}

// Show audit logs modal with session check
async function showAuditLogsModal() {
    try {
        if (!currentUser || currentUser.role !== 'admin') {
            showError('У вас нет прав для просмотра журнала действий');
            return;
        }

        const modal = `
            <div class="modal fade" id="auditLogsModal" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                            <i class="fas fa-history me-2"></i>Журнал действий системы
                            <span class="badge bg-danger ms-2">Администратор</span>
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle me-2"></i>
                                Функция просмотра журнала действий будет реализована в следующем обновлении.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        $('#auditLogsModal').remove();
        $('body').append(modal);
        $('#auditLogsModal').modal('show');
        
    } catch (error) {
        console.error('Show audit logs error:', error);
        showError(error.message || 'Не удалось открыть журнал действий');
    }
}

// Show system health modal - ADMIN ONLY
async function showSystemHealthModal() {
    if (!currentUser || currentUser.role !== 'admin') {
        showError('Только администраторы могут просматривать состояние системы');
        return;
    }

    const modal = `
        <div class="modal fade" id="systemHealthModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-heartbeat me-2"></i>Состояние системы
                            <span class="badge bg-danger ms-2">Администратор</span>
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="systemHealthContainer">
                            <div class="text-center">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Проверка системы...</span>
                                </div>
                                <p class="mt-2">Проверка состояния системы...</p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        <button type="button" class="btn btn-primary" onclick="refreshSystemHealth()">
                            <i class="fas fa-sync me-1"></i>Обновить
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('#systemHealthModal').remove();
    $('body').append(modal);
    $('#systemHealthModal').modal('show');
    
    // Load system health
    refreshSystemHealth();
}

async function refreshSystemHealth() {
    try {
        const health = await apiRequest('/health');
        
        $('#systemHealthContainer').html(`
            <div class="alert alert-success">
                <h6><i class="fas fa-check-circle me-2"></i>Система работает нормально</h6>
                <p class="mb-0">Все компоненты функционируют корректно.</p>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <h6>Статус сервиса</h6>
                    <p class="text-success">✓ ${health.status}</p>
                </div>
                <div class="col-md-6">
                    <h6>Версия</h6>
                    <p>${health.version || 'Не указана'}</p>
                </div>
            </div>
        `);
        
    } catch (error) {
        $('#systemHealthContainer').html(`
            <div class="alert alert-danger">
                <h6><i class="fas fa-exclamation-triangle me-2"></i>Проблемы с системой</h6>
                <p class="mb-0">Обнаружены проблемы: ${error.message}</p>
            </div>
        `);
    }
}

// Placeholder functions for admin tools
function exportSystemData() {
    showError('Функция экспорта данных будет реализована');
}

function cleanupSystem() {
    showError('Функция очистки системы будет реализована');
}

function viewEventDetails(eventId) {
    // Navigate to events page and show details
    navigateTo('events');
    setTimeout(() => {
        if (typeof showEventDetails === 'function') {
            showEventDetails(eventId);
        }
    }, 500);
}

function editEvent(eventId) {
    showError('Функция редактирования событий будет реализована');
}

// Helper functions
function translateRole(role) {
    switch (role) {
        case 'admin': return 'Администратор';
        case 'moderator': return 'Модератор';
        case 'user': return 'Пользователь';
        default: return role;
    }
}

function translateAction(action) {
    switch (action) {
        case 'login': return 'Вход';
        case 'logout': return 'Выход';
        case 'register': return 'Регистрация';
        case 'create_event': return 'Создание события';
        case 'update_event': return 'Изменение события';
        case 'delete_event': return 'Удаление события';
        case 'create_booking': return 'Создание бронирования';
        case 'cancel_booking': return 'Отмена бронирования';
        default: return action;
    }
}

function formatLogDetails(details) {
    if (!details) return 'Нет данных';
    try {
        const parsed = typeof details === 'string' ? JSON.parse(details) : details;
        return Object.keys(parsed).slice(0, 2).map(key => `${key}: ${parsed[key]}`).join(', ');
    } catch {
        return details.toString().substring(0, 50);
    }
}

// Make functions globally available
window.loadAdminPanel = loadAdminPanel;
window.updateUserRole = updateUserRole;
window.updateUserStatus = updateUserStatus;
window.showUserDetails = showUserDetails;
window.showUserActivity = showUserActivity;
window.filterUsers = filterUsers;
window.clearUserSearch = clearUserSearch;
window.showAuditLogsModal = showAuditLogsModal;
window.showSystemHealthModal = showSystemHealthModal;
window.refreshSystemHealth = refreshSystemHealth;
window.exportSystemData = exportSystemData;
window.cleanupSystem = cleanupSystem;
window.viewEventDetails = viewEventDetails;
window.editEvent = editEvent;
window.translateRole = translateRole;
window.translateAction = translateAction;
window.formatLogDetails = formatLogDetails;