// Restricted admin.js with proper role checks
// Load admin panel with role-based restrictions
async function loadAdminPanel() {
    try {
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
                    <button class="btn btn-primary" onclick="navigateTo('events')">
                        <i class="fas fa-arrow-left me-1"></i>Вернуться к мероприятиям
                    </button>
                </div>
            `);
            return;
        }

        try {
            const [users, stats] = await Promise.all([
                apiRequest('/admin/users'),
                apiRequest('/admin/stats')
            ]);
            
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
                        <h2 class="text-primary">${stats.overall.total_users}</h2>
                        <div class="trend trend-up">
                            <i class="fas fa-users me-1"></i>
                            <span>Активные аккаунты</span>
                        </div>
                    </div>
                    <div class="stats-card">
                        <h3>Предстоящие мероприятия</h3>
                        <h2 class="text-info">${stats.overall.total_events}</h2>
                        <div class="trend trend-up">
                            <i class="fas fa-calendar-alt me-1"></i>
                            <span>Запланировано</span>
                        </div>
                    </div>
                    <div class="stats-card">
                        <h3>Подтвержденные бронирования</h3>
                        <h2 class="text-success">${stats.overall.total_bookings}</h2>
                        <div class="trend trend-up">
                            <i class="fas fa-ticket-alt me-1"></i>
                            <span>Подтверждено</span>
                        </div>
                    </div>
                    <div class="stats-card">
                        <h3>Общая выручка</h3>
                        <h2 class="text-warning">${formatPrice(stats.overall.total_revenue)}</h2>
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
                                                            <span class="badge bg-primary">${event.total_bookings}</span>
                                                            <span class="text-muted">/ ${event.capacity}</span>
                                                        </td>
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
                                                ${category !== stats.categories[stats.categories.length - 1] ? '<hr class="mt-2 mb-0">' : ''}
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
                                                <small class="text-muted d-block">${zone.events_using_zone} мероприятий</small>
                                                <small class="text-success">${formatPrice(zone.avg_price)} средняя цена</small>
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
            
        } catch (error) {
            console.error('Failed to load admin data:', error);
            if (error.message === 'Unauthorized') {
                showLoginModal();
            } else {
                $('#content').html(`
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        Не удалось загрузить данные панели управления. Пожалуйста, попробуйте позже.
                        <br><small>Ошибка: ${error.message}</small>
                    </div>
                `);
            }
        }
    } catch (error) {
        console.error('Admin panel error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Ошибка загрузки панели управления');
        }
    }
}

// Show audit logs modal with session check
async function showAuditLogsModal() {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему');
            showLoginModal();
            return;
        }

        // Only admin can view audit logs
        if (currentUser.role !== 'admin') {
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
                            <!-- Filters -->
                            <div class="card mb-3">
                                <div class="card-body">
                                    <h6><i class="fas fa-filter me-1"></i>Фильтры</h6>
                                <div class="row">
                                        <div class="col-md-3">
                                            <label class="form-label">От даты</label>
                                            <input type="date" class="form-control" id="logsStartDate">
                                            </div>
                                        <div class="col-md-3">
                                            <label class="form-label">До даты</label>
                                            <input type="date" class="form-control" id="logsEndDate">
                                                </div>
                                        <div class="col-md-3">
                                            <label class="form-label">Действие</label>
                                            <select class="form-select" id="logsActionFilter">
                                                <option value="">Все действия</option>
                                                <option value="login">Вход в систему</option>
                                                <option value="logout">Выход из системы</option>
                                                <option value="register">Регистрация</option>
                                                <option value="update_user">Изменение пользователя</option>
                                                <option value="create_event">Создание мероприятия</option>
                                                <option value="update_event">Изменение мероприятия</option>
                                                <option value="delete_event">Удаление мероприятия</option>
                                                <option value="create_booking">Создание бронирования</option>
                                                <option value="cancel_booking">Отмена бронирования</option>
                                                <option value="process_payment">Обработка платежа</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">&nbsp;</label>
                                            <button class="btn btn-primary w-100" onclick="applyLogFilters()">
                                                <i class="fas fa-search me-1"></i>Применить
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div id="auditLogsContainer">
                                <div class="text-center">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">Загрузка...</span>
                                    </div>
                                    <p class="mt-2">Загрузка журнала действий...</p>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                            <button type="button" class="btn btn-success" onclick="exportLogs()">
                                <i class="fas fa-download me-1"></i>Экспорт CSV
                            </button>
                            <button type="button" class="btn btn-warning" onclick="clearOldLogs()">
                                <i class="fas fa-broom me-1"></i>Очистить старые
                            </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Remove existing modal if any
        $('#auditLogsModal').remove();
            
            // Add new modal to DOM and show it
        $('body').append(modal);
        $('#auditLogsModal').modal('show');
        
        // Load initial logs
        loadAuditLogs();
    } catch (error) {
        console.error('Show audit logs error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Не удалось загрузить журнал действий');
        }
    }
}

// Load audit logs with session check
async function loadAuditLogs(page = 1, filters = {}) {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему');
            showLoginModal();
            return;
        }

        // Only admin can load audit logs
        if (currentUser.role !== 'admin') {
            showError('У вас нет прав для просмотра журнала действий');
            return;
        }

        const limit = 50;
        const offset = (page - 1) * limit;
        
        // Build query parameters
        const params = new URLSearchParams({
            limit: limit.toString(),
            offset: offset.toString()
        });
        
        // Add filters if provided
        if (filters.start_date) params.append('start_date', filters.start_date);
        if (filters.end_date) params.append('end_date', filters.end_date);
        if (filters.action) params.append('action', filters.action);
        
        const response = await apiRequest(`/admin/logs?${params.toString()}`);
        const { total, logs } = response;
        
        const totalPages = Math.ceil(total / limit);
        
        let html = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <span class="text-muted">Найдено записей: <strong>${total}</strong></span>
                <span class="text-muted">Страница ${page} из ${totalPages}</span>
            </div>
            
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead class="table-dark">
                        <tr>
                            <th>Дата и время</th>
                            <th>Пользователь</th>
                            <th>Роль</th>
                            <th>Действие</th>
                            <th>Детали</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.length > 0 ? logs.map(log => `
                            <tr>
                                <td>
                                    <small class="text-muted">
                                        ${formatDate(log.action_date)}
                                    </small>
                                </td>
                                <td>
                                    <div class="user-info-small">
                                        <strong>${log.username}</strong>
                                        ${log.full_name ? `<br><small class="text-muted">${log.full_name}</small>` : ''}
                                    </div>
                                </td>
                                <td>
                                    <span class="badge ${log.user_role === 'admin' ? 'bg-danger' : 
                                                         log.user_role === 'moderator' ? 'bg-warning' : 'bg-info'}">
                                        ${translateRole(log.user_role)}
                                    </span>
                                </td>
                                <td>
                                    <span class="badge bg-secondary">
                                        ${translateAction(log.action)}
                                    </span>
                                </td>
                                <td>
                                    <small class="text-muted">
                                        ${formatLogDetails(log.details)}
                                    </small>
                                </td>
                            </tr>
                        `).join('') : `
                            <tr>
                                <td colspan="5" class="text-center py-4">
                                    <i class="fas fa-info-circle text-muted me-2"></i>
                                    Нет записей в журнале по заданным критериям
                                </td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>
            
            ${totalPages > 1 ? `
                <nav class="mt-3">
                    <ul class="pagination pagination-sm justify-content-center">
                        ${page > 1 ? `
                            <li class="page-item">
                                <a class="page-link" href="#" onclick="loadAuditLogs(1, ${JSON.stringify(filters)})">
                                    <i class="fas fa-angle-double-left"></i>
                                </a>
                            </li>
                            <li class="page-item">
                                <a class="page-link" href="#" onclick="loadAuditLogs(${page - 1}, ${JSON.stringify(filters)})">
                                    <i class="fas fa-angle-left"></i>
                                </a>
                            </li>
                        ` : ''}
                        
                        ${Array.from({length: Math.min(5, totalPages)}, (_, i) => {
                            const pageNum = Math.max(1, Math.min(totalPages, page - 2 + i));
                            return `
                                <li class="page-item ${pageNum === page ? 'active' : ''}">
                                    <a class="page-link" href="#" onclick="loadAuditLogs(${pageNum}, ${JSON.stringify(filters)})">
                                        ${pageNum}
                                    </a>
                                </li>
                            `;
                        }).join('')}
                        
                        ${page < totalPages ? `
                            <li class="page-item">
                                <a class="page-link" href="#" onclick="loadAuditLogs(${page + 1}, ${JSON.stringify(filters)})">
                                    <i class="fas fa-angle-right"></i>
                                </a>
                            </li>
                            <li class="page-item">
                                <a class="page-link" href="#" onclick="loadAuditLogs(${totalPages}, ${JSON.stringify(filters)})">
                                    <i class="fas fa-angle-double-right"></i>
                                </a>
                            </li>
                        ` : ''}
                    </ul>
                </nav>
            ` : ''}
        `;
        
        $('#auditLogsContainer').html(html);
        
    } catch (error) {
        console.error('Load audit logs error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Не удалось загрузить журнал действий');
        }
    }
}

// Apply log filters with session check
async function applyLogFilters() {
    try {
        // Check authentication first
        if (!currentUser) {
            showError('Пожалуйста, войдите в систему');
            showLoginModal();
            return;
        }

        // Only admin can apply log filters
        if (currentUser.role !== 'admin') {
            showError('У вас нет прав для фильтрации журнала действий');
            return;
        }

        const filters = {
            action_type: $('#logActionFilter').val(),
            user_id: $('#logUserFilter').val(),
            date_from: $('#logDateFrom').val(),
            date_to: $('#logDateTo').val()
        };

        await loadAuditLogs(1, filters);
        
    } catch (error) {
        console.error('Apply log filters error:', error);
        if (error.message === 'Unauthorized') {
            showLoginModal();
        } else {
            showError(error.message || 'Не удалось применить фильтры журнала действий');
        }
    }
}

// Apply log filters
function applyLogFilters() {
    const filters = {};
    
    const startDate = document.getElementById('logsStartDate').value;
    const endDate = document.getElementById('logsEndDate').value;
    const action = document.getElementById('logsActionFilter').value;
    
    if (startDate) filters.start_date = startDate;
    if (endDate) filters.end_date = endDate;
    if (action) filters.action = action;
    
    // Reload logs with filters
    loadAuditLogs(1, filters);
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

    // Remove existing modal if any
    $('#systemHealthModal').remove();
    
    // Add new modal to DOM and show it
    $('body').append(modal);
    $('#systemHealthModal').modal('show');
    
    // Load system health
    refreshSystemHealth();
}

// Rest of the functions remain similar but with enhanced role checking...
// (continuing with other functions)