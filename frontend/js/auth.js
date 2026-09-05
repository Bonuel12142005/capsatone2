// frontend/js/auth.js

const EchoTraceAuth = (() => {
    
    // Auto-logout on page load (clear session on restart)
    const initializeAuth = () => {
        // Check if token is passed in URL (from extension) - if so, don't auto-logout
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromUrl = urlParams.get('token');
        
        if (tokenFromUrl) {
            // Coming from extension - don't clear session
            sessionStorage.setItem('session_initialized', 'true');
            return;
        }
        
        // Check if page was just loaded (not a navigation)
        if (performance.navigation.type === 1 || !sessionStorage.getItem('session_initialized')) {
            // This is a page reload or first load - logout to force re-login
            localStorage.removeItem('echotrace_token');
            localStorage.removeItem('echotrace_user');
            sessionStorage.setItem('session_initialized', 'true');
        }
    };
    
    // Run on script load
    initializeAuth();
    
    const isAuthenticated = () => {
        return localStorage.getItem('echotrace_token') !== null;
    };

    const getUser = () => {
        const userStr = localStorage.getItem('echotrace_user');
        try {
            return userStr ? JSON.parse(userStr) : null;
        } catch (e) {
            return null;
        }
    };

    const isAdmin = () => {
        const user = getUser();
        return user && user.role === 'admin';
    };

    const login = async (usernameOrEmail, password) => {
        try {
            const res = await EchoTraceAPI.post('auth/login', {
                username_or_email: usernameOrEmail,
                password: password
            });

            if (res.success && res.token) {
                localStorage.setItem('echotrace_token', res.token);
                localStorage.setItem('echotrace_user', JSON.stringify(res.user));
                window.dispatchEvent(new Event('authChange'));
                return { success: true, user: res.user };
            }
            return { success: false, error: res.error || "Login failed" };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const register = async (username, email, password) => {
        try {
            const res = await EchoTraceAPI.post('auth/register', {
                username,
                email,
                password
            });
            if (res.success) {
                return { success: true, message: res.message };
            }
            return { success: false, error: res.error || "Registration failed" };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const logout = () => {
        localStorage.removeItem('echotrace_token');
        localStorage.removeItem('echotrace_user');
        window.dispatchEvent(new Event('authChange'));
    };

    const updateProfile = async (username, email) => {
        try {
            const res = await EchoTraceAPI.post('auth/profile/update', { username, email });
            if (res.success) {
                const user = getUser();
                user.username = username;
                user.email = email;
                localStorage.setItem('echotrace_user', JSON.stringify(user));
                window.dispatchEvent(new Event('authChange'));
                return { success: true, message: res.message };
            }
            return { success: false, error: res.error || "Failed to update profile" };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const changePassword = async (oldPassword, newPassword) => {
        try {
            const res = await EchoTraceAPI.post('auth/profile/password', {
                old_password: oldPassword,
                new_password: newPassword
            });
            if (res.success) {
                return { success: true, message: res.message };
            }
            return { success: false, error: res.error || "Failed to update password" };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    return {
        isAuthenticated,
        getUser,
        isAdmin,
        login,
        register,
        logout,
        updateProfile,
        changePassword
    };
})();
