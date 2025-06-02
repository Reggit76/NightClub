// Load admin panel
async function loadAdminPanel() {
    try {
        const [users, stats] = await Promise.all([
            apiRequest('/admin/users'),
            apiRequest('/admin/stats')
        ]);
        
        let html = `
            <div class="row mb-4">
                <div class="col">
                    <h2>Панель управления</h2>
                </div>
                <div class="col-auto">
                    <button class="btn btn-primary" onclick="navigateTo('events')">
                        <i class="fas fa-plus"></i> Создать мероприятие
                    </button>
                </div>
            </div>
            
            <!-- Statistics -->
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="stats-card">
                        <h3>Всего пользователей</h3>
                        <h2>${stats.overall.total_users}</h2>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stats-card">
                        <h3>Всего мероприятий</h3>
                        <h2>${stats.overall.total_events}</h2>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stats-card">
                        <h3>Всего бронирований</h3>
                        <h2>${stats.overall.total_bookings}</h2>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stats-card">
                        <h3>Общая выручка</h3>
                        <h2>${formatPrice(stats.overall.total_revenue)}</h2>
                    </div>
                </div>
            </div>
            
            <!-- Upcoming Events Stats -->
            <div class="row mb-4">
                <div class="col">
                    <div class="stats-card">
                        <h3>Статистика предстоящих мероприятий</h3>
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Мероприятие</th>
                                        <th>Бронирований</th>
                                        <th>Вместимость</th>
                                        <th>Заполненность</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${stats.upcoming_events.map(event => `
                                        <tr>
                                            <td>${event.title}</td>
                                            <td>${event.total_bookings}</td>
                                            <td>${event.capacity}</td>
                                            <td>
                                                <div class="progress">
                                                    <div class="progress-bar" role="progressbar" 
                                                         style="width: ${event.booking_percentage}%">
                                                        ${event.booking_percentage}%
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Category Stats -->
            <div class="row mb-4">
                <div class="col">
                    <div class="stats-card">
                        <h3>Статистика по категориям</h3>
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Категория</th>
                                        <th>Мероприятий</th>
                                        <th>Бронирований</th>
                                        <th>Выручка</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${stats.categories.map(category => `
                                        <tr>
                                            <td>${category.category || 'Без категории'}</td>
                                            <td>${category.total_events}</td>
                                            <td>${category.total_bookings}</td>
                                            <td>${formatPrice(category.revenue)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- User Management -->
            <div class="row">
                <div class="col">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Управление пользователями</h3>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table">
                                    <thead>
                                        <tr>
                                            <th>Имя пользователя</th>
                                            <th>Email</th>
                                            <th>ФИО</th>
                                            <th>Роль</th>
                                            <th>Статус</th>
                                            <th>Действия</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${users.map(user => `
                                            <tr>
                                                <td>${user.username}</td>
                                                <td>${user.email}</td>
                                                <td>${user.first_name} ${user.last_name}</td>
                                                <td>
                                                    <select class="form-select form-select-sm" 
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
                                                    </div>
                                                </td>
                                                <td>
                                                    <button class="btn btn-sm btn-info" 
                                                            onclick="showUserDetails(${user.user_id})">
                                                        Детали
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        $('#content').html(html);
    } catch (error) {
        $('#content').html(`
            <div class="alert alert-danger">
                Произошла ошибка при загрузке панели управления. Пожалуйста, попробуйте позже.
            </div>
        `);
    }
}

// Update user role
async function updateUserRole(userId, role) {
    try {
        await apiRequest(`/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ role })
        });
        
        showSuccess('Роль пользователя успешно обновлена');
    } catch (error) {
        loadAdminPanel(); // Reload to reset the select
    }
}

// Update user status
async function updateUserStatus(userId, isActive) {
    try {
        await apiRequest(`/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ is_active: isActive })
        });
        
        showSuccess('Статус пользователя успешно обновлен');
    } catch (error) {
        loadAdminPanel(); // Reload to reset the checkbox
    }
}

// Show user details
async function showUserDetails(userId) {
    try {
        const user = await apiRequest(`/admin/users/${userId}`);
        
        const html = `
            <div class="modal fade" id="userDetailsModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Детали пользователя</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="card">
                                <div class="card-body">
                                    <h6 class="card-subtitle mb-2 text-muted">Информация о пользователе</h6>
                                    <p class="mb-1"><strong>Имя пользователя:</strong> ${user.username}</p>
                                    <p class="mb-1"><strong>Email:</strong> ${user.email}</p>
                                    <p class="mb-1"><strong>ФИО:</strong> ${user.first_name} ${user.last_name}</p>
                                    <p class="mb-1"><strong>Телефон:</strong> ${user.phone || 'Не указан'}</p>
                                    <p class="mb-1"><strong>Дата рождения:</strong> ${user.birth_date ? formatDate(user.birth_date) : 'Не указана'}</p>
                                    <p class="mb-1"><strong>Роль:</strong> ${translateRole(user.role)}</p>
                                    <p class="mb-1"><strong>Статус:</strong> ${user.is_active ? 'Активен' : 'Неактивен'}</p>
                                    <p class="mb-1"><strong>Дата регистрации:</strong> ${formatDate(user.created_at)}</p>
                                    
                                    <hr>
                                    <h6 class="card-subtitle mb-2 text-muted">Статистика активности</h6>
                                    <p class="mb-1"><strong>Всего бронирований:</strong> ${user.stats.total_bookings}</p>
                                    <p class="mb-1"><strong>Общая сумма заказов:</strong> ${formatPrice(user.stats.total_spent)}</p>
                                    <p class="mb-1"><strong>Последняя активность:</strong> ${user.stats.last_activity ? formatDate(user.stats.last_activity) : 'Никогда'}</p>
                                </div>
                            </div>
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

// Helper function to translate roles
function translateRole(role) {
    const roles = {
        'user': 'Пользователь',
        'moderator': 'Модератор',
        'admin': 'Администратор'
    };
    return roles[role] || role;
} 