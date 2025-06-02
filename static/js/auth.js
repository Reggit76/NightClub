// Login function
async function login(event) {
    event.preventDefault();
    
    const form = document.getElementById('loginForm');
    const formData = new FormData(form);
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: formData.get('username'),
                password: formData.get('password')
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Ошибка входа');
        }
        
        // Store token and update UI
        localStorage.setItem('token', data.access_token);
        currentUser = JSON.parse(atob(data.access_token.split('.')[1]));
        
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
        showError(error.message);
    }
}

// Register function
async function register(event) {
    event.preventDefault();
    
    const form = document.getElementById('registerForm');
    const formData = new FormData(form);
    
    // Validate password confirmation
    if (formData.get('password') !== formData.get('password_confirm')) {
        showError('Пароли не совпадают');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: formData.get('username'),
                email: formData.get('email'),
                password: formData.get('password')
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Ошибка регистрации');
        }
        
        // Close modal and show success message
        $('#registerModal').modal('hide');
        form.reset();
        showSuccess('Регистрация успешна! Теперь вы можете войти в систему.');
    } catch (error) {
        showError(error.message);
    }
}

// Logout function
function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    csrfToken = null;
    updateAuthUI();
    navigateTo('events');
    showSuccess('Вы успешно вышли из системы');
}