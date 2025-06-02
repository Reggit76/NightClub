// Login form handler
$('#loginForm').submit(async function(e) {
    e.preventDefault();
    
    const formData = {
        username: this.username.value,
        password: this.password.value
    };
    
    try {
        const response = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        localStorage.setItem('token', response.access_token);
        const payload = JSON.parse(atob(response.access_token.split('.')[1]));
        currentUser = payload;
        
        $('#loginModal').modal('hide');
        this.reset();
        updateAuthUI();
        showSuccess('Logged in successfully');
        navigateTo('events');
    } catch (error) {
        // Error is handled by apiRequest
    }
});

// Register form handler
$('#registerForm').submit(async function(e) {
    e.preventDefault();
    
    const formData = {
        username: this.username.value,
        email: this.email.value,
        password: this.password.value,
        first_name: this.first_name.value,
        last_name: this.last_name.value
    };
    
    try {
        await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        $('#registerModal').modal('hide');
        this.reset();
        showSuccess('Registered successfully. Please log in.');
    } catch (error) {
        // Error is handled by apiRequest
    }
});

// Logout handler
$('#logoutBtn').click(function() {
    localStorage.removeItem('token');
    currentUser = null;
    updateAuthUI();
    navigateTo('events');
    showSuccess('Logged out successfully');
}); 