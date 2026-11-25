// frontend/js/auth.js

const EchoTraceAuth = (() => {
    let initPromise = null;

    const isAuthenticated = () => {
        return localStorage.getItem('echotrace_token') !== null
            || sessionStorage.getItem('echotrace_token') !== null
            || sessionStorage.getItem('echotrace_cookie_session') === 'true';
    };

    const getUser = () => {
        const userStr = localStorage.getItem('echotrace_user')
            || sessionStorage.getItem('echotrace_user');
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

    const init = async () => {
        if (initPromise) return initPromise;
        initPromise = (async () => {
            const hasLocal = localStorage.getItem('echotrace_token');
            const hasSession = sessionStorage.getItem('echotrace_token');
            if (hasLocal || hasSession) {
                return true;
            }

            // In a new tab or after refresh, verify if an active session cookie exists
            try {
                const res = await EchoTraceAPI.get('auth/session');
                if (res && res.success && res.user) {
                    sessionStorage.setItem('echotrace_user', JSON.stringify(res.user));
                    sessionStorage.setItem('echotrace_cookie_session', 'true');
                    sessionStorage.setItem('echotrace_token_written_at', String(Date.now()));
                    window.dispatchEvent(new Event('authChange'));
                    return true;
                }
            } catch (_) {
                // Not authenticated or network error
            }
            return false;
        })();
        return initPromise;
    };

    const ready = async () => {
        if (!initPromise) {
            init();
        }
        return initPromise;
    };

    const login = async (usernameOrEmail, password, rememberMe = false) => {
        try {
            const res = await EchoTraceAPI.post('auth/login', {
                identifier: String(usernameOrEmail || '').trim(),
                username_or_email: String(usernameOrEmail || '').trim(),
                password: password,
                remember_me: rememberMe
            });

            if (res.success && res.token) {
                localStorage.removeItem('echotrace_token');
                localStorage.removeItem('echotrace_user');
                sessionStorage.removeItem('echotrace_token');
                sessionStorage.removeItem('echotrace_user');
                sessionStorage.removeItem('echotrace_cookie_session');
                const storage = rememberMe ? localStorage : sessionStorage;
                storage.setItem('echotrace_token', res.token);
                storage.setItem('echotrace_user', JSON.stringify(res.user));
                sessionStorage.setItem('echotrace_token_written_at', String(Date.now()));
                initPromise = Promise.resolve(true);
                window.dispatchEvent(new Event('authChange'));
                return { success: true, user: res.user };
            }
            return { success: false, error: res.error || "Login failed" };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const loginWithGoogle = async (credential, rememberMe = true) => {
        try {
            const res = await EchoTraceAPI.post('auth/google-login', {
                credential: String(credential || '').trim(),
                remember_me: rememberMe
            });

            if (res.success && res.requires_verification) {
                // Return verification challenge
                return {
                    success: false,
                    requires_verification: true,
                    email: res.email,
                    email_masked: res.email_masked,
                    message: res.message
                };
            }

            if (res.success && res.token) {
                localStorage.removeItem('echotrace_token');
                localStorage.removeItem('echotrace_user');
                sessionStorage.removeItem('echotrace_token');
                sessionStorage.removeItem('echotrace_user');
                sessionStorage.removeItem('echotrace_cookie_session');
                const storage = rememberMe ? localStorage : sessionStorage;
                storage.setItem('echotrace_token', res.token);
                storage.setItem('echotrace_user', JSON.stringify(res.user));
                sessionStorage.setItem('echotrace_token_written_at', String(Date.now()));
                initPromise = Promise.resolve(true);
                window.dispatchEvent(new Event('authChange'));
                return { success: true, user: res.user };
            }
            return { success: false, error: res.error || "Google sign-in failed." };
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
            return res;
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const verifyEmail = async (email, otp) => {
        try {
            const res = await EchoTraceAPI.post('auth/verify-email', { email, otp });
            if (res.success && res.token) {
                localStorage.removeItem('echotrace_token');
                localStorage.removeItem('echotrace_user');
                sessionStorage.removeItem('echotrace_token');
                sessionStorage.removeItem('echotrace_user');
                sessionStorage.removeItem('echotrace_cookie_session');

                sessionStorage.setItem('echotrace_token', res.token);
                sessionStorage.setItem('echotrace_user', JSON.stringify(res.user));
                sessionStorage.setItem('echotrace_token_written_at', String(Date.now()));
                window.dispatchEvent(new Event('authChange'));
            }
            return res;
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const resendOtp = async (email) => {
        try {
            return await EchoTraceAPI.post('auth/resend-otp', { email });
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const logout = async () => {
        localStorage.removeItem('echotrace_token');
        localStorage.removeItem('echotrace_user');
        sessionStorage.removeItem('echotrace_token');
        sessionStorage.removeItem('echotrace_user');
        sessionStorage.removeItem('echotrace_cookie_session');
        sessionStorage.removeItem('echotrace_token_written_at');
        initPromise = null;
        try { await EchoTraceAPI.post('auth/logout', {}); } catch (_) { }
        window.dispatchEvent(new Event('authChange'));
    };

    const updateProfile = async (username, email) => {
        try {
            const res = await EchoTraceAPI.post('auth/profile/update', { username, email });
            if (res.success) {
                const user = getUser();
                user.username = username;
                user.email = email;
                const storage = localStorage.getItem('echotrace_token') ? localStorage : sessionStorage;
                storage.setItem('echotrace_user', JSON.stringify(user));
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
        init,
        ready,
        login,
        loginWithGoogle,
        register,
        verifyEmail,
        resendOtp,
        logout,
        updateProfile,
        changePassword
    };
})();
