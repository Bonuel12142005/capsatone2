// frontend/js/app.js

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
})[character]);

window.addEventListener('message', (event) => {
    const message = event.data;
    if (event.source !== window || event.origin !== window.location.origin
        || message?.source !== 'ECHOTRACE_EXTENSION') return;

    if (message?.type === 'SCAN_SAVED') {
        if (EchoTraceAuth.isAuthenticated()) loadDashboardData();
        return;
    }
    if (message?.type === 'MANUAL_SCAN_COMPLETED') {
        handleManualExtensionResult(message.data);
        return;
    }
    if (message?.type === 'MANUAL_SCAN_FAILED') {
        handleManualExtensionFailure(message.error);
        return;
    }
    if (message?.type === 'MANUAL_REVIEWS_RESPONSE') {
        handleManualReviewsResponse(message);
        return;
    }
    if (message?.type !== 'OPEN_FULL_REPORT') return;

    const scanId = String(message.scan_id || '').trim();
    if (!/^\d+$/.test(scanId) || Number(scanId) < 1) return;
    sessionStorage.setItem('echotrace_pending_scan_id', scanId);

    const handleRequest = () => {
        if (!EchoTraceAuth.isAuthenticated()) {
            navigateTo('login');
            return;
        }
        sessionStorage.removeItem('echotrace_pending_scan_id');
        openDashboardFullReport(scanId);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handleRequest, { once: true });
    } else {
        setTimeout(handleRequest, 0);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Initial setup
    initApp();

    // Listen for auth state changes
    window.addEventListener('authChange', () => {
        updateNavbar();
        if (EchoTraceAuth.isAuthenticated()) startNotificationPolling();
        else { notificationItems = []; updateNotificationBadge(0); }

        // If logged out and on a protected page, navigate to landing.
        // Skip the redirect if the token was written very recently — this
        // prevents a fast 401 on a parallel dashboard request from
        // immediately redirecting the user who just successfully logged in.
        const currentHash = (window.location.hash.substring(1) || 'landing').split('?')[0];
        const protectedPages = ['dashboard', 'report', 'profile', 'admin', 'rag-assistant', 'audit-history'];
        const tokenAge = Date.now() - (parseInt(sessionStorage.getItem('echotrace_token_written_at') || '0', 10));
        const tokenJustWritten = tokenAge < 3000;
        if (!EchoTraceAuth.isAuthenticated() && !tokenJustWritten && protectedPages.includes(currentHash)) {
            navigateTo('landing');
        } else if (EchoTraceAuth.isAuthenticated() && currentHash === 'login') {
            navigateTo('dashboard');
            const pendingScanId = sessionStorage.getItem('echotrace_pending_scan_id');
            if (pendingScanId) {
                sessionStorage.removeItem('echotrace_pending_scan_id');
                openDashboardFullReport(pendingScanId);
            }
        }
    });

    // Hash change listener for browser navigation
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.substring(1) || 'landing';
        handleRoute(hash);
    });

    const resultsModal = document.getElementById('results-modal');
    resultsModal?.addEventListener('click', (event) => {
        if (event.target === resultsModal) closeResultsModal();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && resultsModal?.classList.contains('flex')) closeResultsModal();
        if (event.key === 'Escape' && document.getElementById('history-delete-modal')?.classList.contains('flex')) closeHistoryDeleteModal();
        if (event.key === 'Escape' && document.getElementById('notifications-clear-modal')?.classList.contains('flex')) closeClearNotificationsModal();
    });
    document.getElementById('history-delete-modal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeHistoryDeleteModal();
    });
    document.getElementById('notifications-clear-modal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeClearNotificationsModal();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        loadNotifications(false);
        refreshAuditHistoryIfVisible();
        const curPage = (window.location.hash.substring(1) || '').split('?')[0];
        if (curPage === 'dashboard' && EchoTraceAuth.isAuthenticated()) {
            loadDashboardData();
        }
    });
    if (EchoTraceAuth.isAuthenticated()) startNotificationPolling();
});

let currentActiveSection = 'view-landing';
let loadedReportReviews = []; // Cache reviews for filtering
let loadedReportData = null; // Cache report data for export
let loadingReportScanId = null;
let reportRequestSequence = 0;
let dashboardRequestSequence = 0;
let reportReviewPage = 1;
const reportReviewPageSize = 10;

const initApp = async () => {
    // Check if token is passed in URL (from extension redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    console.log("[App] Initializing... Token from URL:", tokenFromUrl ? tokenFromUrl.substring(0, 20) + "..." : "NO");

    if (tokenFromUrl) {
        // Auto-login with token from extension
        console.log("[App] Setting token to localStorage...");
        localStorage.setItem('echotrace_token', tokenFromUrl);
        sessionStorage.setItem('session_initialized', 'true');

        try {
            const response = await EchoTraceAPI.get('auth/profile');
            if (response.success && response.user) {
                console.log("[App] User profile loaded successfully:", response.user.username);
                localStorage.setItem('echotrace_user', JSON.stringify(response.user));
                window.dispatchEvent(new Event('authChange'));
            }
        } catch (err) {
            console.warn("[App] Failed to fetch profile with URL token:", err.message);
        }

        // Clean up token from URL without page reload
        const newUrl = window.location.pathname + (window.location.hash || '');
        window.history.replaceState({}, document.title, newUrl);
    } else {
        console.log("[App] No token in URL, proceeding with normal init");
    }

    // Render Icons
    lucide.createIcons();

    // Check initial auth
    updateNavbar();

    // Initialize auth — checks cookie session for new tabs before routing
    await EchoTraceAuth.init();
    updateNavbar(); // re-render navbar after cookie session resolved

    // Handle initial route
    const hash = window.location.hash.substring(1) || 'landing';
    console.log("[App] Navigating to route:", hash);
    handleRoute(hash);

};

const updateNavbar = () => {
    const isAuth = EchoTraceAuth.isAuthenticated();
    const isAdmin = EchoTraceAuth.isAdmin();

    // Show/hide guest vs auth nav links (Desktop)
    const guestOnly = document.getElementById('nav-auth-guest');
    const userOnly = document.getElementById('nav-auth-user');

    // Show/hide guest vs auth nav links (Mobile Sidebar)
    const sidebarGuestOnly = document.getElementById('sidebar-auth-guest');
    const sidebarUserOnly = document.getElementById('sidebar-auth-user');

    if (isAuth) {
        if (guestOnly) guestOnly.classList.add('hidden');
        if (userOnly) userOnly.classList.remove('hidden');
        if (sidebarGuestOnly) sidebarGuestOnly.classList.add('hidden');
        if (sidebarUserOnly) sidebarUserOnly.classList.remove('hidden');

        const user = EchoTraceAuth.getUser();
        const username = user ? user.username : 'Profile';

        const navUsernameEl = document.getElementById('nav-username');
        if (navUsernameEl) navUsernameEl.textContent = username;

        const sidebarUsernameEl = document.getElementById('sidebar-username');
        if (sidebarUsernameEl) sidebarUsernameEl.textContent = username;

        // Show auth links
        document.querySelectorAll('.auth-only').forEach(el => el.classList.remove('hidden'));
    } else {
        if (guestOnly) guestOnly.classList.remove('hidden');
        if (userOnly) userOnly.classList.add('hidden');
        if (sidebarGuestOnly) sidebarGuestOnly.classList.remove('hidden');
        if (sidebarUserOnly) sidebarUserOnly.classList.add('hidden');

        // Hide auth links
        document.querySelectorAll('.auth-only').forEach(el => el.classList.add('hidden'));
    }

    if (isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    } else {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    }

    lucide.createIcons();
};

const toggleMobileMenu = () => {
    const sidebar = document.getElementById('mobile-sidebar');
    const panel = document.getElementById('mobile-sidebar-panel');
    if (!sidebar || !panel) return;

    if (sidebar.classList.contains('hidden')) {
        // Open Mobile Sidebar
        sidebar.classList.remove('hidden');
        document.documentElement.classList.add('overflow-hidden');
        document.body.classList.add('overflow-hidden');
        // Force reflow
        void sidebar.offsetWidth;
        panel.classList.remove('translate-x-full');
        panel.classList.add('translate-x-0');
    } else {
        // Close Mobile Sidebar
        document.documentElement.classList.remove('overflow-hidden');
        document.body.classList.remove('overflow-hidden');
        panel.classList.remove('translate-x-0');
        panel.classList.add('translate-x-full');
        // Wait for slide-out animation to complete (300ms) before hiding block
        setTimeout(() => {
            sidebar.classList.add('hidden');
        }, 300);
    }

    // Ensure Lucide icon elements render inside the sidebar
    lucide.createIcons();
};

const navigateTo = (pageName, params = '') => {
    const newHash = pageName + (params ? `?${params}` : '');
    if (window.location.hash === '#' + newHash) {
        handleRoute(newHash);
    } else {
        window.location.hash = newHash;
    }
};

const handleRoute = (routeString) => {
    // Parse params if any
    const parts = routeString.split('?');
    const page = parts[0];
    const params = new URLSearchParams(parts[1] || '');

    const targetSectionId = `view-${page}`;
    const targetElement = document.getElementById(targetSectionId);

    if (!targetElement) {
        // Fallback to landing if section doesn't exist
        showSection('view-landing');
        return;
    }

    // Auth Route Guard
    const protectedPages = ['dashboard', 'report', 'profile', 'admin', 'rag-assistant', 'audit-history'];
    if (protectedPages.includes(page) && !EchoTraceAuth.isAuthenticated()) {
        navigateTo('login');
        return;
    }

    // Admin Route Guard
    if (page === 'admin' && !EchoTraceAuth.isAdmin()) {
        navigateTo('dashboard');
        return;
    }

    showSection(targetSectionId);

    // Route-specific loader actions
    if (page === 'verify-email') {
        initVerifyEmailView();
    } else if (page === 'dashboard') {
        loadDashboardData();
    } else if (page === 'report') {
        const scanId = params.get('scan_id');
        if (scanId) {
            loadReportData(scanId);
        } else {
            navigateTo('dashboard');
        }
    } else if (page === 'profile') {
        loadProfileData();
    } else if (page === 'admin') {
        loadAdminData();
    } else if (page === 'rag-assistant') {
        loadRagAssistant();
    } else if (page === 'audit-history') {
        loadAuditHistory();
    }
};

const showSection = (sectionId) => {
    document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.add('hidden');
    });
    const activeSec = document.getElementById(sectionId);
    activeSec.classList.remove('hidden');

    // Update active nav link styles if necessary
    lucide.createIcons();
};

// --- AUTHENTICATION ACTIONS ---

const submitLogin = async (e) => {
    e.preventDefault();
    const loginInput = document.getElementById('login-input').value;
    const loginPass = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me')?.checked === true;
    const errorEl = document.getElementById('login-error');
    const submitButton = document.querySelector('#login-form button[type="submit"]');

    errorEl.classList.add('hidden');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.dataset.originalText = submitButton.textContent;
        submitButton.textContent = 'Signing in...';
    }

    try {
        const res = await EchoTraceAuth.login(loginInput, loginPass, rememberMe);
        if (res.success) {
            if (window.location.hash !== '#dashboard') {
                navigateTo('dashboard');
            }
        } else if (res && res.requires_verification) {
            sessionStorage.setItem('echotrace_pending_verification_email', res.email || loginInput.trim());
            navigateTo('verify-email');
        } else {
            errorEl.textContent = res.error || "Login credentials incorrect.";
            errorEl.classList.remove('hidden');
            document.getElementById('login-password').select();
        }
    } catch (error) {
        errorEl.textContent = error?.message || 'Unable to reach the EchoTrace server. Please try again.';
        errorEl.classList.remove('hidden');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = submitButton.dataset.originalText || 'Sign In';
        }
    }
};

const submitRegister = async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const errorEl = document.getElementById('register-error');
    const successEl = document.getElementById('register-success');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    const res = await EchoTraceAuth.register(username, email, password);
    if (res.success) {
        document.getElementById('register-form').reset();
        if (res.requires_verification) {
            sessionStorage.setItem('echotrace_pending_verification_email', res.email || email.trim());
            navigateTo('verify-email');
        } else {
            successEl.textContent = res.message || "Registration completed. You can login now!";
            successEl.classList.remove('hidden');
            setTimeout(() => navigateTo('login'), 2000);
        }
    } else {
        errorEl.textContent = res.error || "Failed to create account.";
        errorEl.classList.remove('hidden');
    }
};


// --- GOOGLE IDENTITY SERVICES INTEGRATION ---

let googleClientIdConfigured = null;
let googleGsiInitialized = false;

const initGoogleIdentityServices = async () => {
    try {
        if (!googleClientIdConfigured) {
            const res = await EchoTraceAPI.get('auth/google-client-id');
            if (res && res.success && res.client_id) {
                googleClientIdConfigured = res.client_id;
            }
        }

        if (!googleClientIdConfigured) {
            console.info('[EchoTrace] Google Client ID is not yet configured on the server.');
            return;
        }

        if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
            // GSI library still downloading asynchronously; poll briefly
            setTimeout(initGoogleIdentityServices, 300);
            return;
        }

        if (googleGsiInitialized) return;

        google.accounts.id.initialize({
            client_id: googleClientIdConfigured,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            context: 'signin'
        });

        // Render official button into containers if present
        const officialContainer = document.getElementById('google-official-btn-container');
        if (officialContainer) {
            google.accounts.id.renderButton(officialContainer, {
                theme: 'filled_black',
                size: 'large',
                width: '100%',
                shape: 'rectangular',
                text: 'continue_with'
            });
        }
        const officialSignupContainer = document.getElementById('google-official-signup-btn-container');
        if (officialSignupContainer) {
            google.accounts.id.renderButton(officialSignupContainer, {
                theme: 'filled_black',
                size: 'large',
                width: '100%',
                shape: 'rectangular',
                text: 'continue_with'
            });
        }

        googleGsiInitialized = true;
        console.log('[EchoTrace] Google Identity Services successfully initialized.');
    } catch (err) {
        console.warn('[EchoTrace] Could not initialize Google Identity Services:', err);
    }
};

const triggerGoogleSignIn = () => {
    const isRegister = window.location.hash.includes('register');
    const errorEl = document.getElementById(isRegister ? 'register-error' : 'login-error');
    if (errorEl) errorEl.classList.add('hidden');

    if (!googleClientIdConfigured) {
        // Fetch client ID if not cached yet
        EchoTraceAPI.get('auth/google-client-id').then(res => {
            if (res && res.success && res.client_id) {
                googleClientIdConfigured = res.client_id;
                initGoogleIdentityServices().then(() => {
                    executeGooglePrompt();
                });
            } else {
                if (errorEl) {
                    errorEl.textContent = 'Google Sign-In is not configured. Set GOOGLE_CLIENT_ID in your .env file.';
                    errorEl.classList.remove('hidden');
                }
            }
        }).catch(err => {
            if (errorEl) {
                errorEl.textContent = 'Unable to check Google Sign-In service. Check connection.';
                errorEl.classList.remove('hidden');
            }
        });
        return;
    }

    executeGooglePrompt();
};

const executeGooglePrompt = () => {
    const errorEl = document.getElementById('login-error');
    const googleBtn = document.getElementById('google-custom-btn');
    const googleText = document.getElementById('google-btn-text');

    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        if (errorEl) {
            errorEl.textContent = 'Google Sign-In service is loading. Please wait a moment and try again.';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (!googleGsiInitialized) {
        google.accounts.id.initialize({
            client_id: googleClientIdConfigured,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            context: 'signin'
        });
        googleGsiInitialized = true;
    }

    // Try prompt
    google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // Prompt was dismissed, closed, or suppressed by browser settings (e.g., third-party cookies or popups)
            console.log('[EchoTrace] Google One Tap dismissed or suppressed:', notification.getNotDisplayedReason?.() || notification.getSkippedReason?.());
            // If official button rendered, trigger click on it as fallback
            const isRegister = window.location.hash.includes('register');
            const targetContainer = isRegister ? '#google-official-signup-btn-container' : '#google-official-btn-container';
            const officialBtn = document.querySelector(targetContainer + ' div[role="button"]') || document.querySelector('#google-official-btn-container div[role="button"]');
            if (officialBtn) {
                officialBtn.click();
            }
        }
    });
};

const handleGoogleCredentialResponse = async (response) => {
    const isRegister = window.location.hash.includes('register');
    const errorEl = document.getElementById(isRegister ? 'register-error' : 'login-error');
    const googleBtn = document.getElementById(isRegister ? 'google-signup-custom-btn' : 'google-custom-btn');
    const googleText = document.getElementById(isRegister ? 'google-signup-btn-text' : 'google-btn-text');
    const rememberMe = document.getElementById('remember-me')?.checked !== false;

    if (!response || !response.credential) {
        if (errorEl) {
            errorEl.textContent = 'Google did not return an identity credential. Please try again.';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (errorEl) errorEl.classList.add('hidden');
    if (googleBtn) {
        googleBtn.disabled = true;
        if (googleText) googleText.textContent = 'Signing in with Google…';
    }

    try {
        const res = await EchoTraceAuth.loginWithGoogle(response.credential, rememberMe);
        if (res.success) {
            if (window.location.hash !== '#dashboard') {
                navigateTo('dashboard');
            }
        } else {
            if (errorEl) {
                errorEl.textContent = res.error || 'Google authentication failed.';
                errorEl.classList.remove('hidden');
            }
        }
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = err?.message || 'Server error during Google sign-in. Please try again.';
            errorEl.classList.remove('hidden');
        }
    } finally {
        if (googleBtn) {
            googleBtn.disabled = false;
            if (googleText) googleText.textContent = 'Continue with Google';
        }
    }
};

const handleLogout = () => {
    EchoTraceAuth.logout();
    navigateTo('landing');
};

// --- PROFILE & SETTINGS ---

const loadProfileData = () => {
    const user = EchoTraceAuth.getUser();
    if (user) {
        document.getElementById('profile-username').value = user.username || '';
        document.getElementById('profile-email').value = user.email || '';
    }
};

const submitContactForm = async (e) => {
    e.preventDefault();
    const name = document.getElementById('contact-name').value;
    const email = document.getElementById('contact-email').value;
    const subject = document.getElementById('contact-subject').value;
    const message = document.getElementById('contact-message').value;
    const msgEl = document.getElementById('contact-msg');

    msgEl.classList.add('hidden');

    try {
        const res = await EchoTraceAPI.post('support/contact', { name, email, subject, message });
        if (res.success) {
            msgEl.className = "p-3 text-xs rounded-xl text-center bg-emerald-500/10 text-emerald-400";
            msgEl.textContent = res.message || "Thank you! Your message has been sent successfully.";
            msgEl.classList.remove('hidden');
            document.getElementById('contact-form').reset();
        } else {
            msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
            msgEl.textContent = res.error || "Failed to submit message.";
            msgEl.classList.remove('hidden');
        }
    } catch (err) {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
        msgEl.textContent = err.message || "An unexpected error occurred.";
        msgEl.classList.remove('hidden');
    }
};

const submitProfile = async (e) => {
    e.preventDefault();
    const username = document.getElementById('profile-username').value;
    const email = document.getElementById('profile-email').value;
    const msgEl = document.getElementById('profile-msg');

    msgEl.classList.add('hidden');

    const res = await EchoTraceAuth.updateProfile(username, email);
    if (res.success) {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-emerald-500/10 text-emerald-400";
        msgEl.textContent = res.message;
        msgEl.classList.remove('hidden');
    } else {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
        msgEl.textContent = res.error;
        msgEl.classList.remove('hidden');
    }
};

const submitPassword = async (e) => {
    e.preventDefault();
    const oldPass = document.getElementById('pass-old').value;
    const newPass = document.getElementById('pass-new').value;
    const confirmPass = document.getElementById('pass-confirm').value;
    const msgEl = document.getElementById('password-msg');

    msgEl.classList.add('hidden');

    if (newPass !== confirmPass) {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
        msgEl.textContent = "New passwords do not match.";
        msgEl.classList.remove('hidden');
        return;
    }

    const res = await EchoTraceAuth.changePassword(oldPass, newPass);
    if (res.success) {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-emerald-500/10 text-emerald-400";
        msgEl.textContent = res.message;
        msgEl.classList.remove('hidden');
        document.getElementById('password-form').reset();
    } else {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
        msgEl.textContent = res.error;
        msgEl.classList.remove('hidden');
    }
};

// --- USER DASHBOARD ACTIONS ---

let allScans = [];
const selectedHistoryScanIds = new Set();
let historyDeleteRequest = null;
let historyDeleteInProgress = false;
let historyDeleteReturnFocus = null;

const updateHistorySelectionUi = (displayedScans = null) => {
    const displayed = displayedScans || allScans;
    const visibleIds = displayed.map(scan => String(scan.id));
    const selectedCount = selectedHistoryScanIds.size;
    const selectAll = document.getElementById('history-select-all');
    if (selectAll) {
        selectAll.checked = visibleIds.length > 0 && visibleIds.every(id => selectedHistoryScanIds.has(id));
        selectAll.indeterminate = visibleIds.some(id => selectedHistoryScanIds.has(id)) && !selectAll.checked;
    }
    const counter = document.getElementById('history-selection-count');
    if (counter) counter.textContent = `${selectedCount} record${selectedCount === 1 ? '' : 's'} selected`;
    const selectedButton = document.getElementById('history-delete-selected');
    if (selectedButton) selectedButton.disabled = selectedCount === 0 || historyDeleteInProgress;
    const allButton = document.getElementById('history-delete-all');
    if (allButton) allButton.disabled = allScans.length === 0 || historyDeleteInProgress;
};

const toggleHistoryScanSelection = (scanId, checked) => {
    const id = String(scanId);
    if (checked) selectedHistoryScanIds.add(id); else selectedHistoryScanIds.delete(id);
    document.querySelectorAll(`[data-history-scan-id="${id}"]`).forEach(input => { input.checked = checked; });
    updateHistorySelectionUi();
};

const toggleAllHistorySelections = (checked) => {
    const visible = getDisplayedHistoryScans();
    visible.forEach(scan => checked ? selectedHistoryScanIds.add(String(scan.id)) : selectedHistoryScanIds.delete(String(scan.id)));
    populateHistoryTable(visible);
};

const getDisplayedHistoryScans = () => {
    const search = document.getElementById('history-search')?.value.trim().toLowerCase() || '';
    return search ? allScans.filter(s => String(s.product_title || '').toLowerCase().includes(search) || String(s.platform || '').toLowerCase().includes(search)) : allScans;
};

const openHistoryDeleteModal = (request) => {
    const modal = document.getElementById('history-delete-modal');
    if (!modal || historyDeleteInProgress) return;
    historyDeleteReturnFocus = document.activeElement;
    historyDeleteRequest = request;
    document.getElementById('history-delete-modal-title').textContent = request.type === 'all' ? 'Delete All Audit History?' : request.ids.length === 1 ? 'Delete Audit Record?' : 'Delete Selected Audit Records?';
    document.getElementById('history-delete-modal-message').textContent = request.type === 'all'
        ? `You are about to permanently delete all ${request.count} audit records in your account and their associated report data. This action cannot be undone.`
        : `You are about to permanently delete ${request.count} selected audit record${request.count === 1 ? '' : 's'} and their associated report data. This action cannot be undone.`;
    const status = document.getElementById('history-delete-modal-status'); status.classList.add('hidden'); status.textContent = '';
    modal.classList.remove('hidden'); modal.classList.add('flex');
    document.getElementById('history-delete-confirm')?.focus();
    if (window.lucide) lucide.createIcons();
};

const closeHistoryDeleteModal = () => {
    if (historyDeleteInProgress) return;
    const modal = document.getElementById('history-delete-modal');
    modal?.classList.add('hidden'); modal?.classList.remove('flex'); historyDeleteRequest = null;
    historyDeleteReturnFocus?.focus?.(); historyDeleteReturnFocus = null;
};

const requestDeleteSelectedScans = () => {
    const ids = [...selectedHistoryScanIds];
    if (ids.length) openHistoryDeleteModal({ type: 'selected', ids, count: ids.length });
};

const requestDeleteAllScans = () => {
    if (allScans.length) openHistoryDeleteModal({ type: 'all', ids: [], count: allScans.length });
};

const deleteScan = (scanId) => {
    const normalizedId = String(scanId || '').trim();
    if (/^\d+$/.test(normalizedId)) openHistoryDeleteModal({ type: 'selected', ids: [normalizedId], count: 1 });
};

const confirmHistoryDeletion = async () => {
    if (!historyDeleteRequest || historyDeleteInProgress) return;
    historyDeleteInProgress = true;
    const request = historyDeleteRequest;
    const confirmButton = document.getElementById('history-delete-confirm');
    const cancelButton = document.getElementById('history-delete-cancel');
    const status = document.getElementById('history-delete-modal-status');
    confirmButton.disabled = true; cancelButton.disabled = true; confirmButton.textContent = 'Deleting...';
    status.textContent = 'Deleting audit records securely...'; status.className = 'mt-3 text-sm text-sky-300';
    updateHistorySelectionUi();
    try {
        const response = request.type === 'all'
            ? await EchoTraceAPI.delete('scan/delete-all')
            : await EchoTraceAPI.delete('scan/delete-selected', { scan_ids: request.ids });
        if (!response?.success) throw new Error(response?.error || 'Unable to delete the scan record.');
        (response.scan_ids || request.ids).forEach(id => selectedHistoryScanIds.delete(String(id)));
        if (request.type === 'all') selectedHistoryScanIds.clear();
        await loadDashboardData();
        historyDeleteInProgress = false; closeHistoryDeleteModal();
        showNotification(response.message || 'Audit records deleted successfully.', 'success');
    } catch (error) {
        console.error('[EchoTrace] Scan deletion failed:', error); status.textContent = error.message || 'Unable to delete the audit records. Please try again.'; status.className = 'mt-3 text-sm text-rose-300';
    } finally {
        historyDeleteInProgress = false; confirmButton.disabled = false; cancelButton.disabled = false; confirmButton.textContent = 'Delete Records'; updateHistorySelectionUi();
    }
};

const populateDashboardHistoryError = (message) => {
    const tbody = document.getElementById('history-table-body');
    const mobileCards = document.getElementById('history-mobile-cards');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="p-8 text-center text-rose-400 text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 opacity-60 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                    ${message}
                    <br><button onclick="loadDashboardData()" class="mt-3 inline-block text-xs text-cyan-400 border border-cyan-400/30 px-3 py-1 rounded-lg hover:bg-cyan-400/10 transition-all">Retry</button>
                </td>
            </tr>`;
    }
    if (mobileCards) {
        mobileCards.innerHTML = `<div class="text-center text-rose-400 text-sm py-8">${message}</div>`;
    }
};

const loadDashboardData = async () => {
    // 1. Wait for authentication initialization to resolve before querying protected history
    if (typeof EchoTraceAuth !== 'undefined' && typeof EchoTraceAuth.ready === 'function') {
        await EchoTraceAuth.ready();
    }
    if (!EchoTraceAuth.isAuthenticated()) return;

    const requestId = ++dashboardRequestSequence;

    // Show loading state if no scans are rendered yet
    const tbody = document.getElementById('history-table-body');
    const mobileCards = document.getElementById('history-mobile-cards');
    if (tbody && (!allScans || allScans.length === 0)) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="p-8 text-center text-gray-500">
                    <i data-lucide="loader" class="w-4 h-4 animate-spin inline-block mr-2"></i>Loading history...
                </td>
            </tr>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    if (mobileCards && (!allScans || allScans.length === 0)) {
        mobileCards.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i data-lucide="loader" class="w-4 h-4 animate-spin inline-block mr-2"></i>Loading history...
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    try {
        const user = EchoTraceAuth.getUser();
        if (user) {
            const welcomeEl = document.getElementById('dashboard-welcome');
            if (welcomeEl) welcomeEl.textContent = `Welcome back, ${user.username}`;
        }

        // Bounded automatic retry: try up to 3 times (initial + 2 retries) with short backoff
        let data = null;
        let lastError = null;
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (requestId !== dashboardRequestSequence) return;
            try {
                data = await EchoTraceAPI.get('scan/history');
                if (data && data.success) {
                    break;
                }
                lastError = new Error(data?.error || 'Invalid scan history response.');
            } catch (err) {
                lastError = err;
                // Do not retry confirmed authentication rejections
                if (err?.status === 401 || err?.status === 403 || err?.code === 'unauthorized') {
                    throw err;
                }
                // Short exponential backoff for transient network or server busy state
                if (attempt < maxAttempts) {
                    const delayMs = attempt * 300;
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }

        if (requestId !== dashboardRequestSequence) return;

        if (!data || !data.success) {
            throw lastError || new Error('Failed to load scan history.');
        }

        allScans = data.history || [];
        [...selectedHistoryScanIds].forEach(id => {
            if (!allScans.some(scan => String(scan.id) === id)) selectedHistoryScanIds.delete(id);
        });

        // 1. Render Table Rows (independent of charts or stats)
        populateHistoryTable(allScans);

        // 2. Compute and update stat cards safely
        try {
            const totalScans = allScans.length;
            let fakeCount = 0;
            let genuineCount = 0;

            allScans.forEach(s => {
                fakeCount += parseInt(s.fake_count || 0);
                genuineCount += parseInt(s.genuine_count || 0);
            });

            const statScansEl = document.getElementById('stat-scans');
            const statFakesEl = document.getElementById('stat-fakes');
            const statGenuinesEl = document.getElementById('stat-genuines');
            if (statScansEl) statScansEl.textContent = totalScans;
            if (statFakesEl) statFakesEl.textContent = fakeCount;
            if (statGenuinesEl) statGenuinesEl.textContent = genuineCount;
        } catch (statErr) {
            console.warn('[EchoTrace] Stats computation warning:', statErr);
        }

        // 3. Fetch model accuracy asynchronously
        EchoTraceAPI.get('scan/model-accuracy').then(evalRes => {
            const ev = evalRes?.model_evaluation;
            const el = document.getElementById('stat-accuracy');
            if (!el) return;
            if (ev?.status === 'evaluated' && ev?.test_accuracy != null) {
                el.textContent = `${parseFloat(ev.test_accuracy).toFixed(2)}%`;
                el.title = `Test accuracy on ${ev.test_size ?? '?'} held-out samples (${ev.dataset_scope ?? 'labeled data'})`;
            } else {
                el.textContent = 'N/A';
                el.title = 'No valid held-out model evaluation is available yet.';
            }
        }).catch(() => {
            const el = document.getElementById('stat-accuracy');
            if (el) el.textContent = 'N/A';
        });

        // 4. Render Dashboard Charts safely in isolated try/catch
        try {
            const platforms = {};
            allScans.forEach(s => {
                const plat = s.platform || 'unknown';
                platforms[plat] = (platforms[plat] || 0) + 1;
            });
            const platformList = Object.keys(platforms).map(k => ({ platform: k, count: platforms[k] }));
            const recentScansForChart = [...allScans].slice(0, 7).reverse();

            if (typeof EchoTraceCharts !== 'undefined' && typeof EchoTraceCharts.renderDashboardCharts === 'function') {
                EchoTraceCharts.renderDashboardCharts(recentScansForChart, platformList);
            }
        } catch (chartErr) {
            console.warn('[EchoTrace] Dashboard chart render warning (non-fatal):', chartErr);
        }
    } catch (e) {
        if (requestId !== dashboardRequestSequence) return;
        console.error('[EchoTrace] Dashboard history load error:', e);
        if (allScans && allScans.length > 0) {
            // Keep valid existing data visible during background refresh failures
            if (typeof showNotification === 'function') {
                showNotification('Unable to refresh recent audit history.', 'warning');
            }
        } else {
            populateDashboardHistoryError('Unable to load scan history. Check your connection and try again.');
        }
    }
};

const populateHistoryTable = (scans) => {
    const tbody = document.getElementById('history-table-body');
    const mobileCards = document.getElementById('history-mobile-cards');

    if (!tbody || !mobileCards) {
        console.warn('[EchoTrace] history-table-body or history-mobile-cards not found in DOM');
        return;
    }

    tbody.innerHTML = '';
    mobileCards.innerHTML = '';

    if (!scans || scans.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="p-10 text-center">
                    <div class="flex flex-col items-center gap-3 text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                        <p class="text-sm font-medium">No audit history yet</p>
                        <p class="text-xs text-gray-600">Run your first scan using the <span class="text-emerald-400">Screenshot Analyzer</span> above</p>
                    </div>
                </td>
            </tr>
        `;
        mobileCards.innerHTML = `
            <div class="flex flex-col items-center gap-3 text-gray-500 py-10">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                <p class="text-sm font-medium">No audit history yet</p>
                <p class="text-xs text-gray-600">Run your first scan to see results here</p>
            </div>
        `;
        return;
    }


    scans.forEach((s) => {
        const scanId = Number(s.id);
        if (!Number.isInteger(scanId) || scanId < 1) return;
        const safeScanId = String(scanId);
        const safePlatform = escapeHtml(s.platform || 'unknown');
        const safeProductTitle = escapeHtml(s.product_title || 'Untitled product');
        // Desktop table row
        const tr = document.createElement('tr');
        tr.className = "hover:bg-glassBorder/10 transition-colors";

        const platformBadge = `<span class="px-2.5 py-1 text-[10px] font-bold rounded-lg border uppercase ${s.platform === 'amazon' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                s.platform === 'shopee' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
                    'bg-sky-500/10 border-sky-500/20 text-sky-400'
            }">${safePlatform}</span>`;

        const trustPct = parseFloat(s.trust_score || 0);
        const trustClass = trustPct >= 80 ? 'text-emerald-400' : (trustPct >= 50 ? 'text-amber-400' : 'text-rose-400');

        const date = new Date(s.scan_date).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        tr.innerHTML = `
            <td class="p-4"><input type="checkbox" aria-label="Select audit record" data-history-scan-id="${safeScanId}" ${selectedHistoryScanIds.has(safeScanId) ? 'checked' : ''} onchange="toggleHistoryScanSelection('${safeScanId}', this.checked)" class="accent-emeraldGreen"></td>
            <td class="p-4">${platformBadge}</td>
            <td class="p-4 font-semibold text-white max-w-xs truncate">${safeProductTitle}</td>
            <td class="p-4 font-bold ${trustClass}">${trustPct.toFixed(2)}%</td>
            <td class="p-4 text-rose-400">${s.fake_count || 0} / ${parseInt(s.fake_count || 0) + parseInt(s.genuine_count || 0) + parseInt(s.uncertain_count || 0)}</td>
            <td class="p-4 text-gray-400 text-xs">${date}</td>
            <td class="p-4 text-center">
                <div class="flex items-center justify-center gap-2">
                    <button onclick="openDashboardFullReport('${safeScanId}')" class="text-xs bg-emeraldGreen/10 border border-emeraldGreen/30 text-emeraldGreen px-3 py-1 rounded-lg hover:bg-emeraldGreen hover:text-white transition-all">View Report</button>
                    <button type="button" onclick="deleteScan('${safeScanId}', this)" data-delete-scan-id="${safeScanId}" class="text-xs bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3 py-1 rounded-lg hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-wait">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);

        // Mobile card
        const card = document.createElement('div');
        card.className = "glass-panel p-4 rounded-xl border border-glassBorder hover:bg-glassBorder/10 transition-colors";

        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <label class="mr-2 pt-1"><input type="checkbox" aria-label="Select audit record" data-history-scan-id="${safeScanId}" ${selectedHistoryScanIds.has(safeScanId) ? 'checked' : ''} onchange="toggleHistoryScanSelection('${safeScanId}', this.checked)" class="accent-emeraldGreen"></label>
                <div class="flex-1 min-w-0 pr-3">
                    <div class="flex items-center gap-2 mb-1">
                        ${platformBadge}
                        <span class="text-xs text-gray-400">${date}</span>
                    </div>
                    <h4 class="font-semibold text-white text-sm leading-tight line-clamp-2">${safeProductTitle}</h4>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="text-xl font-bold ${trustClass}">${trustPct.toFixed(0)}%</div>
                    <div class="text-[10px] text-gray-400 uppercase font-semibold">Trust</div>
                </div>
            </div>
            
            <div class="flex justify-between items-center">
                <div class="flex items-center space-x-4 text-xs">
                    <div>
                        <span class="text-rose-400 font-semibold">${s.fake_count || 0}</span>
                        <span class="text-gray-500">fake</span>
                    </div>
                    <div class="w-px h-3 bg-glassBorder"></div>
                    <div>
                        <span class="text-emerald-400 font-semibold">${s.genuine_count || 0}</span>
                        <span class="text-gray-500">genuine</span>
                    </div>
                    <div class="w-px h-3 bg-glassBorder"></div>
                    <div>
                        <span class="text-amber-400 font-semibold">${s.uncertain_count || 0}</span>
                        <span class="text-gray-500">uncertain</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="openDashboardFullReport('${safeScanId}')" class="text-xs bg-emeraldGreen/10 border border-emeraldGreen/30 text-emeraldGreen px-3 py-1.5 rounded-lg hover:bg-emeraldGreen hover:text-white transition-all flex items-center space-x-1">
                        <span>View Report</span><i data-lucide="arrow-right" class="w-3 h-3"></i>
                    </button>
                    <button type="button" onclick="deleteScan('${safeScanId}', this)" data-delete-scan-id="${safeScanId}" class="text-xs bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3 py-1.5 rounded-lg hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-wait">Delete</button>
                </div>
            </div>
        `;

        mobileCards.appendChild(card);
    });

    console.log('Mobile cards after population:', mobileCards.children.length); // Temporary debug

    // Force mobile view visibility for debugging  
    if (mobileCards.children.length > 0) {
        console.log('Mobile cards populated successfully! Check if container is visible.');
        // Force show mobile container for debugging
        const mobileContainer = mobileCards.parentElement;
        if (mobileContainer) {
            console.log('Mobile container classes:', mobileContainer.className);
        }
    }

    // Initialize Lucide icons for the new cards
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    updateHistorySelectionUi(scans);
};

const filterHistory = () => {
    const filtered = getDisplayedHistoryScans();
    populateHistoryTable(filtered);

    // Re-initialize Lucide icons after filtering
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
};

// --- CHROME EXTENSION DOWNLOAD ACTIONS ---

const downloadExtension = () => {
    // Direct link to the PHP download endpoint
    const downloadUrl = EchoTraceAPI.getBaseURL() + 'extension/download';

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'echotrace-extension.zip';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification('Download started! Follow the installation guide to set it up.', 'success');
};

const showInstallInstructions = () => {
    const instructions = document.getElementById('install-instructions');
    instructions.classList.toggle('hidden');

    // Re-initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
};

const showNotification = (message, type = 'info') => {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl border transition-all duration-300 transform translate-x-full ${type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
            type === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                'bg-sky-500/10 border-sky-500/30 text-sky-400'
        }`;

    notification.innerHTML = `
        <div class="flex items-center space-x-3">
            <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info'}" class="w-5 h-5"></i>
            <span class="font-semibold">${message}</span>
        </div>
    `;

    document.body.appendChild(notification);

    // Initialize icon
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Animate in
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);

    // Auto remove after 4 seconds
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
};

// --- SCREENSHOT REVIEW ANALYZER ACTIONS ---

let screenshotFiles = [];
let screenshotPreviewUrls = [];
let extractedReviews = [];
let extractedDuplicatesRemoved = 0;
let extractedOcrWarnings = [];
let screenshotScanResult = null;
let isOcrExtracting = false;
let isScreenshotAnalyzing = false;
let screenshotOcrController = null;
let screenshotAnalysisController = null;

const openScanModal = () => {
    const modal = document.getElementById('scan-modal');
    if (modal) {
        modal.classList.remove('hidden');
        dismissScreenshotError();
        dismissScreenshotWarning();
        renderExtractedReviews();
        if (window.lucide) lucide.createIcons();
    }
};

const closeScanModal = () => {
    const modal = document.getElementById('scan-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
};

const triggerScreenshotPicker = () => {
    const input = document.getElementById('screenshot-file-input');
    if (input) input.click();
};

const handleScreenshotDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dropzone = document.getElementById('screenshot-dropzone');
    if (dropzone) {
        dropzone.classList.add('border-cyan-400', 'bg-cyan-500/10');
    }
};

const handleScreenshotDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dropzone = document.getElementById('screenshot-dropzone');
    if (dropzone) {
        dropzone.classList.remove('border-cyan-400', 'bg-cyan-500/10');
    }
};

const handleScreenshotDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dropzone = document.getElementById('screenshot-dropzone');
    if (dropzone) {
        dropzone.classList.remove('border-cyan-400', 'bg-cyan-500/10');
    }
    if (e.dataTransfer && e.dataTransfer.files) {
        addScreenshotFiles(e.dataTransfer.files);
    }
};

const handleScreenshotFileSelection = (e) => {
    if (e.target && e.target.files) {
        addScreenshotFiles(e.target.files);
        e.target.value = ''; // Allow re-selecting same files
    }
};

const addScreenshotFiles = (files) => {
    dismissScreenshotError();
    const validExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    const maxFiles = 5;
    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB

    const incoming = Array.from(files);
    if (!incoming.length) return;

    if (screenshotFiles.length + incoming.length > maxFiles) {
        showScreenshotError(`Maximum ${maxFiles} screenshots allowed per scan. Please remove some images first.`);
        return;
    }

    const added = [];
    for (const file of incoming) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!validExtensions.includes(ext)) {
            showScreenshotError(`Unsupported file format: "${file.name}". Please upload JPG, JPEG, PNG, or WEBP images only.`);
            continue;
        }
        if (file.size > maxSizeBytes) {
            showScreenshotError(`File "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum size is 5 MB per screenshot.`);
            continue;
        }
        added.push(file);
    }

    if (added.length) {
        screenshotFiles = screenshotFiles.concat(added);
        renderScreenshotPreviews();
        updateScreenshotStatusPill('Screenshots ready — extract when ready', 'emerald');
        showScreenshotWarning('Screenshots are selected. Click “Extract Reviews” to process them; no review text is assumed before OCR completes.');
    }
};

const renderScreenshotPreviews = () => {
    const container = document.getElementById('screenshot-preview-container');
    const grid = document.getElementById('screenshot-thumbnails-grid');
    const label = document.getElementById('screenshot-count-label');
    if (!container || !grid) return;

    screenshotPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    screenshotPreviewUrls = [];

    if (!screenshotFiles.length) {
        container.classList.add('hidden');
        grid.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    if (label) {
        label.textContent = `${screenshotFiles.length} of 5 screenshot${screenshotFiles.length === 1 ? '' : 's'} selected`;
    }

    grid.innerHTML = '';
    screenshotFiles.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        screenshotPreviewUrls.push(url);
        const safeFileName = escapeHtml(file.name);
        const card = document.createElement('div');
        card.className = 'relative group rounded-xl overflow-hidden border border-[#1E3A5F] bg-[#030712] aspect-square flex flex-col items-center justify-center p-1.5 shadow-md';

        const sizeFormatted = file.size > 1024 * 1024
            ? (file.size / (1024 * 1024)).toFixed(1) + ' MB'
            : Math.round(file.size / 1024) + ' KB';

        card.innerHTML = `
            <img src="${url}" alt="${safeFileName}" class="w-full h-full object-cover rounded-lg group-hover:opacity-80 transition-opacity">
            <button type="button" 
                    onclick="removeScreenshotFile(${index})" 
                    aria-label="Remove image"
                    class="absolute top-1 right-1 bg-rose-500/90 hover:bg-rose-600 text-white p-1 rounded-full shadow-lg transition-transform hover:scale-110">
                <i data-lucide="x" class="w-3 h-3"></i>
            </button>
            <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 text-[9px] text-gray-300 truncate text-center">
                <span class="truncate block">${safeFileName}</span>
                <span class="text-cyan-400 font-mono text-[8px]">${sizeFormatted}</span>
            </div>
        `;
        grid.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
};

const removeScreenshotFile = (index) => {
    if (index >= 0 && index < screenshotFiles.length) {
        screenshotFiles.splice(index, 1);
        renderScreenshotPreviews();
        if (!screenshotFiles.length) {
            updateScreenshotStatusPill('Ready', 'emerald');
            hideOcrProgress();
        }
    }
};

const clearAllScreenshots = () => {
    screenshotFiles = [];
    renderScreenshotPreviews();
    hideOcrProgress();
    updateScreenshotStatusPill('Ready', 'emerald');
};

const renderExtractedReviews = () => {
    const list = document.getElementById('extracted-reviews-list');
    const badge = document.getElementById('extracted-count-badge');
    const statsBar = document.getElementById('extracted-stats-bar');
    const analyzeBtn = document.getElementById('btn-analyze-screenshots');
    if (!list) return;

    const count = extractedReviews.length;
    const selectedCount = extractedReviews.filter(review => review.selected !== false && review.text && review.text.trim()).length;
    if (badge) badge.textContent = `${count} Review${count === 1 ? '' : 's'}`;

    if (analyzeBtn) {
        analyzeBtn.disabled = selectedCount === 0 || isScreenshotAnalyzing;
    }

    if (count === 0) {
        list.innerHTML = `
            <div id="extracted-empty-state" class="p-8 text-center rounded-2xl border border-glassBorder bg-[#030712]/40 text-gray-500 space-y-2">
                <i data-lucide="file-text" class="w-8 h-8 mx-auto text-gray-600"></i>
                <p class="text-xs text-gray-400 font-medium">No reviews extracted yet</p>
                <p class="text-[11px] text-gray-500">Upload screenshot(s) above, or tap "+ Add Review" to manually type customer reviews.</p>
            </div>
        `;
        if (statsBar) statsBar.classList.add('hidden');
        if (window.lucide) lucide.createIcons();
        return;
    }

    if (statsBar) {
        statsBar.classList.remove('hidden');
        const languages = [...new Set(extractedReviews.map(r => r.language || 'English'))];
        const validStat = document.getElementById('extracted-valid-stat');
        const screenshotStat = document.getElementById('extracted-screenshot-stat');
        const langStat = document.getElementById('extracted-languages-stat');
        if (validStat) validStat.textContent = `Confirmed reviews: ${selectedCount} / ${count}`;
        if (screenshotStat) screenshotStat.textContent = `Screenshots: ${screenshotFiles.length}`;
        const duplicateStat = document.getElementById('extracted-duplicates-stat');
        if (duplicateStat) duplicateStat.textContent = `Duplicates removed: ${extractedDuplicatesRemoved}`;
        if (langStat) langStat.textContent = `Languages: ${languages.join(', ')}`;
    }

    list.innerHTML = '';
    extractedReviews.forEach((rev, idx) => {
        const card = document.createElement('div');
        card.className = 'scan-review-card animate-fade-in';
        card.id = `extracted-card-${idx}`;

        const langBadgeClass = rev.language === 'Tagalog' ? 'bg-amber-400/10 text-amber-300 border-amber-400/30'
            : rev.language === 'Taglish' ? 'bg-purple-400/10 text-purple-300 border-purple-400/30'
                : 'bg-cyan-400/10 text-cyan-300 border-cyan-400/30';

        card.innerHTML = `
            <div class="scan-review-card-controls">
                <div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                    <label class="flex items-center gap-1.5 text-[10px] text-gray-400 shrink-0" title="Include this review in analysis">
                        <input type="checkbox" ${rev.selected !== false ? 'checked' : ''} onchange="toggleExtractedReview(${idx}, this.checked)" class="accent-cyan-400">
                        <span>Include</span>
                    </label>
                    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-cyan-400/20 text-cyan-300 text-[10px] font-bold">#${idx + 1}</span>
                    <input type="text" 
                           value="${escapeHtml(rev.author || 'Anonymous')}" 
                           placeholder="Author" 
                           onchange="updateExtractedReviewAuthor(${idx}, this.value)"
                           class="scan-review-author-input">
                    <select onchange="updateExtractedReviewRating(${idx}, this.value)" 
                            class="scan-review-rating-select">
                        <option value="" ${(rev.rating === null || rev.rating === undefined) ? 'selected' : ''}>No rating</option>
                        <option value="5" ${Number(rev.rating) === 5 ? 'selected' : ''}>★ 5</option>
                        <option value="4" ${Number(rev.rating) === 4 ? 'selected' : ''}>★ 4</option>
                        <option value="3" ${Number(rev.rating) === 3 ? 'selected' : ''}>★ 3</option>
                        <option value="2" ${Number(rev.rating) === 2 ? 'selected' : ''}>★ 2</option>
                        <option value="1" ${Number(rev.rating) === 1 ? 'selected' : ''}>★ 1</option>
                    </select>
                    <span class="rounded-md border px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${langBadgeClass}">${escapeHtml(rev.language || 'English')}</span>
                </div>
                <div class="scan-review-card-actions">
                    <button type="button" 
                            onclick="deleteExtractedReview(${idx})" 
                            aria-label="Delete this review"
                            title="Delete"
                            class="text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-500/10 rounded-md transition-colors flex items-center gap-1">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5 shrink-0"></i>
                        <span class="text-[11px] hidden sm:inline">Delete</span>
                    </button>
                    <button type="button"
                            onclick="splitExtractedReview(${idx})"
                            aria-label="Split at cursor"
                            title="Split at cursor position"
                            class="text-violet-300 hover:text-violet-200 p-1.5 hover:bg-violet-500/10 rounded-md transition-colors flex items-center gap-1">
                        <i data-lucide="split" class="w-3.5 h-3.5 shrink-0"></i>
                        <span class="text-[11px] hidden sm:inline">Split</span>
                    </button>
                </div>
            </div>
            <div class="w-full min-w-0">
                <textarea rows="3" 
                          placeholder="Extracted customer review text..." 
                          oninput="updateExtractedReviewText(${idx}, this.value)"
                          >${escapeHtml(rev.text || '')}</textarea>
                <div class="flex justify-between text-[10px] text-gray-500 mt-1 gap-2 min-w-0">
                    <span class="shrink-0">${(rev.text || '').length} chars</span>
                    <span class="truncate text-right ${rev.warning ? 'text-amber-300' : 'text-gray-400'}">${escapeHtml(rev.warning || 'OCR Extracted Entry')}</span>
                </div>
            </div>
        `;
        list.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
};

const addManualReviewCard = () => {
    dismissScreenshotError();
    extractedReviews.push({
        id: 'rev-manual-' + Date.now(),
        text: '',
        author: 'Anonymous',
        rating: 5,
        language: 'English',
        selected: true,
        warning: 'Review text must be confirmed by the user.'
    });
    renderExtractedReviews();
    const list = document.getElementById('extracted-reviews-list');
    if (list) {
        list.scrollTop = list.scrollHeight;
        const textareas = list.querySelectorAll('textarea');
        if (textareas.length) textareas[textareas.length - 1].focus();
    }
};

const updateExtractedReviewText = (idx, text) => {
    if (extractedReviews[idx]) {
        extractedReviews[idx].text = text;
        const analyzeBtn = document.getElementById('btn-analyze-screenshots');
        const hasSelectedText = extractedReviews.some(r => r.selected !== false && r.text && r.text.trim());
        if (analyzeBtn) analyzeBtn.disabled = !hasSelectedText || isScreenshotAnalyzing;
    }
};

const toggleExtractedReview = (idx, selected) => {
    if (!extractedReviews[idx]) return;
    extractedReviews[idx].selected = Boolean(selected);
    renderExtractedReviews();
};

const selectAllExtractedReviews = (selected = true) => {
    extractedReviews.forEach(review => { review.selected = Boolean(selected); });
    renderExtractedReviews();
};

const mergeSelectedExtractedReviews = () => {
    const selectedIndexes = extractedReviews
        .map((review, index) => review.selected !== false && review.text && review.text.trim() ? index : -1)
        .filter(index => index >= 0);
    if (selectedIndexes.length < 2) {
        showScreenshotError('Select at least two non-empty review cards before merging them.');
        return;
    }

    const firstIndex = selectedIndexes[0];
    const first = extractedReviews[firstIndex];
    const mergedText = selectedIndexes.map(index => extractedReviews[index].text.trim()).join('\n\n');
    const mergedOriginal = selectedIndexes.map(index => extractedReviews[index].original_text || extractedReviews[index].text.trim()).join('\n\n');
    first.text = mergedText;
    first.original_text = mergedOriginal;
    first.rating = null;
    first.warning = 'Merged by the user; verify the review boundary before analysis.';
    first.selected = true;
    const selectedSet = new Set(selectedIndexes);
    extractedReviews = extractedReviews.filter((_, index) => index === firstIndex || !selectedSet.has(index));
    renderExtractedReviews();
};

const splitExtractedReview = (idx) => {
    const review = extractedReviews[idx];
    const textarea = document.querySelector(`#extracted-card-${idx} textarea`);
    if (!review || !textarea) return;
    const cursor = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : -1;
    const text = review.text || '';
    if (cursor <= 0 || cursor >= text.length) {
        showScreenshotError('Place the text cursor between two words, then press Split.');
        return;
    }
    const left = text.slice(0, cursor).trim();
    const right = text.slice(cursor).trim();
    if (!left || !right) {
        showScreenshotError('Both split sections must contain review text.');
        return;
    }
    const base = { ...review, rating: null, selected: true };
    const first = { ...base, id: `${review.id || 'ocr'}-a`, text: left, original_text: left, warning: 'Split by the user; verify both review boundaries before analysis.' };
    const second = { ...base, id: `${review.id || 'ocr'}-b`, text: right, original_text: right, warning: 'Split by the user; verify both review boundaries before analysis.' };
    extractedReviews.splice(idx, 1, first, second);
    renderExtractedReviews();
};

const updateExtractedReviewAuthor = (idx, author) => {
    if (extractedReviews[idx]) extractedReviews[idx].author = author.trim() || 'Anonymous';
};

const updateExtractedReviewRating = (idx, rating) => {
    if (!extractedReviews[idx]) return;
    const parsed = parseInt(rating, 10);
    extractedReviews[idx].rating = Number.isFinite(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
};

const deleteExtractedReview = (idx) => {
    if (idx >= 0 && idx < extractedReviews.length) {
        extractedReviews.splice(idx, 1);
        renderExtractedReviews();
    }
};

const clearExtractedReviews = () => {
    extractedReviews = [];
    extractedDuplicatesRemoved = 0;
    extractedOcrWarnings = [];
    renderExtractedReviews();
};

const clearAllScreenshotsAndReviews = () => {
    if (screenshotOcrController) screenshotOcrController.abort();
    if (screenshotAnalysisController) screenshotAnalysisController.abort();
    screenshotOcrController = null;
    screenshotAnalysisController = null;
    isOcrExtracting = false;
    isScreenshotAnalyzing = false;
    screenshotFiles = [];
    extractedReviews = [];
    extractedDuplicatesRemoved = 0;
    extractedOcrWarnings = [];
    screenshotScanResult = null;
    renderScreenshotPreviews();
    renderExtractedReviews();
    dismissScreenshotError();
    dismissScreenshotWarning();
    hideOcrProgress();
    updateScreenshotStatusPill('Ready', 'emerald');
    const resultPanel = document.getElementById('screenshot-scan-result');
    if (resultPanel) resultPanel.classList.add('hidden');
};

const setOcrProgress = (percent, message, subdetail) => {
    const container = document.getElementById('ocr-progress-container');
    const bar = document.getElementById('ocr-progress-bar');
    const pct = document.getElementById('ocr-progress-percent');
    const msg = document.getElementById('ocr-status-message');
    const sub = document.getElementById('ocr-substatus-detail');
    if (!container) return;

    container.classList.remove('hidden');
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (pct) pct.textContent = `${Math.round(percent)}%`;
    if (msg && message) msg.textContent = message;
    if (sub && subdetail) sub.textContent = subdetail;
};

const hideOcrProgress = () => {
    const container = document.getElementById('ocr-progress-container');
    if (container) container.classList.add('hidden');
};

const showScreenshotError = (msg) => {
    const box = document.getElementById('screenshot-error');
    const text = document.getElementById('screenshot-error-msg');
    if (box && text) {
        text.textContent = msg;
        box.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    }
};

const dismissScreenshotError = () => {
    const box = document.getElementById('screenshot-error');
    const text = document.getElementById('screenshot-error-msg');
    if (box) box.classList.add('hidden');
    if (text) text.textContent = '';
};

const showScreenshotWarning = (msg) => {
    const box = document.getElementById('screenshot-warning');
    const text = document.getElementById('screenshot-warning-msg');
    if (box && text) {
        text.textContent = msg;
        box.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    }
};

const dismissScreenshotWarning = () => {
    const box = document.getElementById('screenshot-warning');
    if (box) box.classList.add('hidden');
};

const updateScreenshotStatusPill = (statusText, color = 'emerald') => {
    const pill = document.getElementById('screenshot-status-pill');
    if (!pill) return;
    const bgClass = color === 'cyan' ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300'
        : color === 'amber' ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
            : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
    pill.className = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${bgClass}`;
    pill.innerHTML = `<span class="h-1.5 w-1.5 rounded-full bg-${color}-400 animate-pulse"></span> ${statusText}`;
};

const renderScreenshotScanResult = (result) => {
    const panel = document.getElementById('screenshot-scan-result');
    if (!panel) return;

    screenshotScanResult = result;
    const trustScoreEl = document.getElementById('screenshot-result-trust');
    const genuineEl = document.getElementById('screenshot-result-genuine');
    const suspiciousEl = document.getElementById('screenshot-result-suspicious');
    const uncertainEl = document.getElementById('screenshot-result-uncertain');
    const totalEl = document.getElementById('screenshot-result-total');
    const listEl = document.getElementById('screenshot-result-reviews-list');

    const metrics = result.metrics || {};
    const total = Number(metrics.total_scanned ?? (result.results || []).length);
    const genuine = Number(metrics.genuine_detected ?? 0);
    const suspicious = Number(metrics.fake_detected ?? 0);
    const uncertain = Number(metrics.uncertain_detected ?? 0);

    const qualifyingDenominator = genuine + suspicious;
    if (qualifyingDenominator > 0) {
        const computedTrust = (genuine / qualifyingDenominator) * 100;
        if (trustScoreEl) {
            trustScoreEl.textContent = `${computedTrust.toFixed(1)}%`;
            trustScoreEl.className = 'mt-1 text-xl sm:text-2xl font-black text-cyan-300 break-words';
        }
    } else {
        if (trustScoreEl) {
            trustScoreEl.textContent = 'Insufficient Evidence';
            trustScoreEl.className = 'mt-1 text-xs sm:text-sm font-black text-cyan-300 break-words';
        }
    }

    if (genuineEl) genuineEl.textContent = String(genuine);
    if (suspiciousEl) suspiciousEl.textContent = String(suspicious);
    if (uncertainEl) uncertainEl.textContent = String(uncertain);
    if (totalEl) totalEl.textContent = String(total);

    if (listEl && Array.isArray(result.results)) {
        listEl.innerHTML = '';
        result.results.forEach((item, idx) => {
            const isUncertain = item.classification && item.classification.toLowerCase().includes('uncertain');
            const isFake = Boolean(item.is_fake);
            const badgeClass = isUncertain ? 'bg-amber-400/10 text-amber-300 border-amber-400/30'
                : isFake ? 'bg-rose-400/10 text-rose-300 border-rose-400/30'
                    : 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30';
            const label = isUncertain ? 'Uncertain (Needs Review)'
                : isFake ? 'Suspicious Review'
                    : 'Genuine Review';

            const card = document.createElement('div');
            card.className = 'glass-panel p-3 rounded-xl border border-glassBorder bg-[#030712]/50 text-xs space-y-1.5 min-w-0';
            const fakeProbability = Number.isFinite(Number(item.fake_probability_percent))
                ? Number(item.fake_probability_percent)
                : Number(item.confidence_score || 0);
            const genuineProbability = Number.isFinite(Number(item.genuine_probability_percent))
                ? Number(item.genuine_probability_percent)
                : Math.max(0, 100 - fakeProbability);
            card.innerHTML = `
                <div class="flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <span class="font-bold text-gray-300 truncate">#${idx + 1} ${item.author ? 'by ' + escapeHtml(item.author) : ''}</span>
                    <span class="rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${badgeClass}">${label}</span>
                </div>
                <p class="text-gray-300 leading-relaxed break-words">${escapeHtml(item.text || '')}</p>
                <div class="flex flex-wrap items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-glassBorder/40 gap-2">
                    <span>Language: ${escapeHtml(item.language || 'English')}</span>
                    <span>Fake: ${fakeProbability.toFixed(1)}% · Genuine: ${genuineProbability.toFixed(1)}%</span>
                </div>
            `;
            listEl.appendChild(card);
        });
    }

    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth' });
    if (window.lucide) lucide.createIcons();
};

const openScreenshotFullReport = () => {
    if (screenshotScanResult?.scan_id) {
        closeScanModal();
        if (typeof openDashboardFullReport === 'function') {
            openDashboardFullReport(screenshotScanResult.scan_id);
        }
    } else {
        showScreenshotError('Full report is not yet available. Analyze reviews first.');
    }
};

const submitScreenshotAnalysis = async () => {
    const validReviews = extractedReviews.filter(r => r.selected !== false && r.text && r.text.trim());
    if (!validReviews.length) {
        showScreenshotError('Please ensure at least one customer review has text before analyzing.');
        return;
    }

    // A new attempt must not leave an older successful result visible while
    // the request is pending or if this attempt fails/cancels.
    screenshotScanResult = null;
    const previousResultPanel = document.getElementById('screenshot-scan-result');
    if (previousResultPanel) previousResultPanel.classList.add('hidden');

    const analyzeBtn = document.getElementById('btn-analyze-screenshots');
    const cancelBtn = document.getElementById('btn-cancel-screenshot-processing');
    const analyzeBtnText = document.getElementById('btn-analyze-screenshots-text');
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    if (analyzeBtnText) analyzeBtnText.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-1"></i> Running AI Analysis…';
    if (window.lucide) lucide.createIcons();

    isScreenshotAnalyzing = true;
    const analysisController = new AbortController();
    screenshotAnalysisController = analysisController;
    updateScreenshotStatusPill('Analyzing…', 'cyan');
    dismissScreenshotError();

    const platform = document.getElementById('screenshot-product-platform')?.value || 'auto';
    const title = document.getElementById('screenshot-product-title')?.value || 'Screenshot Review Audit';
    const optDuplicates = document.getElementById('screenshot-opt-duplicates')?.checked ?? true;
    const optExplanations = document.getElementById('screenshot-opt-explanations')?.checked ?? true;
    const optLanguage = document.getElementById('screenshot-opt-language')?.checked ?? true;
    const optUncertain = document.getElementById('screenshot-opt-uncertain')?.checked ?? true;

    try {
        const externalId = await stableScreenshotExternalId(validReviews, title.trim() || 'Screenshot Review Audit');
        const payload = {
            url: '',
            reviews: validReviews.map((r, i) => ({
                id: r.id || `ocr-${i + 1}`,
                text: r.text.trim(),
                author: r.author || 'Anonymous',
                rating: r.rating ?? null
            })),
            metadata: {
                title: title.trim() || 'Screenshot Review Audit',
                external_id: externalId,
                screenshot_count: screenshotFiles.length,
                ocr_candidate_count: extractedReviews.length + extractedDuplicatesRemoved,
                confirmed_review_count: validReviews.length,
                ocr_duplicates_removed: extractedDuplicatesRemoved,
                ocr_warnings: extractedOcrWarnings
            },
            source: 'screenshot_ocr',
            options: {
                detect_duplicates: optDuplicates,
                show_explanations: optExplanations,
                detect_language: optLanguage,
                include_uncertain: optUncertain
            }
        };

        const result = await EchoTraceAPI.post('scan/manual-reviews', payload, { signal: analysisController.signal });
        if (!result || !result.success) {
            throw new Error(result?.error || 'Analysis could not be completed.');
        }

        renderScreenshotScanResult(result);
        updateScreenshotStatusPill('Analysis Complete', 'emerald');
        refreshAuditHistoryIfVisible();
        showNotification('Screenshot reviews analyzed successfully!', 'success');
    } catch (err) {
        console.error('[EchoTrace] Screenshot analysis error:', err);
        if (err?.name === 'AbortError') {
            showScreenshotError('Analysis was cancelled. The server will not display a successful result without a completed AI response.');
            updateScreenshotStatusPill('Analysis cancelled', 'amber');
        } else {
            showScreenshotError(err.message || 'AI analysis failed. Please verify the AI service is running.');
            updateScreenshotStatusPill('Error', 'amber');
        }
    } finally {
        isScreenshotAnalyzing = false;
        screenshotAnalysisController = null;
        if (analyzeBtn) analyzeBtn.disabled = false;
        if (cancelBtn) cancelBtn.classList.add('hidden');
        if (analyzeBtnText) analyzeBtnText.textContent = 'Analyze Reviews with AI';
        if (window.lucide) lucide.createIcons();
    }
};

const stableScreenshotExternalId = async (reviews, title) => {
    const source = JSON.stringify({
        title: String(title || '').trim(),
        reviews: reviews.map(review => String(review.text || '').replace(/\s+/g, ' ').trim())
    });
    let digest = '';
    if (window.crypto?.subtle && window.TextEncoder) {
        const bytes = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
        digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    } else {
        let hash = 2166136261;
        for (let index = 0; index < source.length; index += 1) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        digest = (hash >>> 0).toString(16).padStart(8, '0');
    }
    return `screenshot-${digest.slice(0, 48)}`;
};

const requestScreenshotExtraction = () => {
    if (!screenshotFiles.length) {
        showScreenshotError('Choose at least one screenshot before extracting reviews.');
        return;
    }
    if (typeof window.runOcrExtractionPipeline !== 'function') {
        showScreenshotError('OCR extraction is not available yet. No review text was extracted or saved.');
        updateScreenshotStatusPill('OCR unavailable', 'amber');
        return;
    }
    window.runOcrExtractionPipeline(screenshotFiles);
};

/**
 * Send selected images to the authenticated PHP OCR bridge. The bridge only
 * returns candidates; the existing AI analysis is not started until the user
 * verifies and submits review text.
 */
const runOcrExtractionPipeline = async (files) => {
    if (isOcrExtracting) return;
    if (!Array.isArray(files) || !files.length) {
        showScreenshotError('Choose at least one screenshot before extracting reviews.');
        return;
    }

    isOcrExtracting = true;
    screenshotOcrController = new AbortController();
    const extractBtn = document.getElementById('btn-extract-screenshots');
    const cancelBtn = document.getElementById('btn-cancel-screenshot-processing');
    if (extractBtn) extractBtn.disabled = true;
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    dismissScreenshotError();
    setOcrProgress(10, 'Validating screenshots...', 'Checking file type, size, and image dimensions.');
    updateScreenshotStatusPill('Preparing OCR...', 'cyan');

    try {
        const form = new FormData();
        files.forEach(file => form.append('screenshots[]', file, file.name));
        form.append('platform', document.getElementById('screenshot-product-platform')?.value || 'auto');
        form.append('title', document.getElementById('screenshot-product-title')?.value || 'Screenshot Review Audit');

        setOcrProgress(30, 'Extracting review text...', 'The server is running bounded open-source OCR.');
        const result = await EchoTraceAPI.upload('scan/screenshot-ocr', form, { signal: screenshotOcrController.signal });
        const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
        if (!result?.success || !candidates.length) {
            throw new Error(result?.error || 'No customer review text was detected. Nothing was saved.');
        }

        extractedReviews = candidates.map((review, index) => ({
            id: review.id || `ocr-${index + 1}`,
            text: String(review.text || ''),
            original_text: String(review.original_text || review.text || ''),
            author: review.author || 'Anonymous',
            rating: review.rating ?? null,
            language: review.language || 'English',
            confidence: review.confidence,
            warning: review.warning || 'Review boundaries are heuristic; verify this text before analysis.',
            selected: true
        })).filter(review => review.text.trim());
        extractedDuplicatesRemoved = Number(result.duplicates_removed || 0);
        extractedOcrWarnings = Array.isArray(result.warnings) ? result.warnings : [];

        if (!extractedReviews.length) {
            throw new Error('No customer review text was detected. Nothing was saved.');
        }
        renderExtractedReviews();
        setOcrProgress(100, 'OCR extraction complete', `${extractedReviews.length} review candidate${extractedReviews.length === 1 ? '' : 's'} require verification.`);
        updateScreenshotStatusPill('Reviews extracted', 'emerald');
        if (extractedOcrWarnings.length) {
            showScreenshotWarning(extractedOcrWarnings.join(' '));
        }
    } catch (error) {
        if (error?.name === 'AbortError') {
            updateScreenshotStatusPill('OCR cancelled', 'amber');
            showScreenshotError('OCR extraction was cancelled. No review text was extracted or saved.');
        } else {
            console.error('[EchoTrace] Screenshot OCR extraction failed:', error);
            updateScreenshotStatusPill('OCR unavailable', 'amber');
            showScreenshotError(error?.message || 'OCR extraction failed. No review text was extracted or saved.');
        }
        hideOcrProgress();
    } finally {
        isOcrExtracting = false;
        screenshotOcrController = null;
        if (extractBtn) extractBtn.disabled = false;
        if (cancelBtn) cancelBtn.classList.add('hidden');
        if (window.lucide) lucide.createIcons();
    }
};

const cancelScreenshotProcessing = () => {
    if (screenshotOcrController) screenshotOcrController.abort();
    if (screenshotAnalysisController) screenshotAnalysisController.abort();
    screenshotOcrController = null;
    screenshotAnalysisController = null;
    isOcrExtracting = false;
    isScreenshotAnalyzing = false;
    hideOcrProgress();
    updateScreenshotStatusPill('Cancelled', 'amber');
    showScreenshotError('Processing was cancelled. No new analysis result was saved by the browser.');
    const cancelBtn = document.getElementById('btn-cancel-screenshot-processing');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    const extractBtn = document.getElementById('btn-extract-screenshots');
    if (extractBtn) extractBtn.disabled = false;
    const analyzeBtn = document.getElementById('btn-analyze-screenshots');
    if (analyzeBtn) analyzeBtn.disabled = !extractedReviews.some(review => review.selected !== false && review.text && review.text.trim());
};

// Global bindings for inline event attributes
window.openScanModal = openScanModal;
window.closeScanModal = closeScanModal;
window.triggerScreenshotPicker = triggerScreenshotPicker;
window.handleScreenshotDragOver = handleScreenshotDragOver;
window.handleScreenshotDragLeave = handleScreenshotDragLeave;
window.handleScreenshotDrop = handleScreenshotDrop;
window.handleScreenshotFileSelection = handleScreenshotFileSelection;
window.removeScreenshotFile = removeScreenshotFile;
window.clearAllScreenshots = clearAllScreenshots;
window.renderExtractedReviews = renderExtractedReviews;
window.setExtractedReviews = (reviews) => { extractedReviews = reviews; renderExtractedReviews(); };
window.addManualReviewCard = addManualReviewCard;
window.updateExtractedReviewText = updateExtractedReviewText;
window.updateExtractedReviewAuthor = updateExtractedReviewAuthor;
window.updateExtractedReviewRating = updateExtractedReviewRating;
window.deleteExtractedReview = deleteExtractedReview;
window.clearExtractedReviews = clearExtractedReviews;
window.toggleExtractedReview = toggleExtractedReview;
window.selectAllExtractedReviews = selectAllExtractedReviews;
window.mergeSelectedExtractedReviews = mergeSelectedExtractedReviews;
window.splitExtractedReview = splitExtractedReview;
window.requestScreenshotExtraction = requestScreenshotExtraction;
window.runOcrExtractionPipeline = runOcrExtractionPipeline;
window.cancelScreenshotProcessing = cancelScreenshotProcessing;
window.clearAllScreenshotsAndReviews = clearAllScreenshotsAndReviews;
window.setOcrProgress = setOcrProgress;
window.hideOcrProgress = hideOcrProgress;
window.showScreenshotError = showScreenshotError;
window.dismissScreenshotError = dismissScreenshotError;
window.showScreenshotWarning = showScreenshotWarning;
window.dismissScreenshotWarning = dismissScreenshotWarning;
window.renderScreenshotScanResult = renderScreenshotScanResult;
window.openScreenshotFullReport = openScreenshotFullReport;
window.submitScreenshotAnalysis = submitScreenshotAnalysis;


// --- FLOATING RAG COPILOT CHATBOT ---

const toggleRagChat = () => {
    const win = document.getElementById('rag-chat-window');
    const icon = document.getElementById('rag-float-icon');
    const isHidden = win.classList.contains('hidden');
    win.classList.toggle('hidden', !isHidden);
    // Swap icon between bot and x
    if (isHidden) {
        icon.setAttribute('data-lucide', 'x');
        lucide.createIcons();
        document.getElementById('rag-float-input').focus();
    } else {
        icon.setAttribute('data-lucide', 'bot');
        lucide.createIcons();
    }
};

const submitFloatRagQuery = async (e) => {
    e.preventDefault();
    const input = document.getElementById('rag-float-input');
    const sendBtn = document.getElementById('rag-float-btn-send');
    const messages = document.getElementById('rag-float-messages');
    const category = document.getElementById('rag-float-category').value;
    const query = input.value.trim();
    if (!query) return;

    // Append user message
    const userMsg = document.createElement('div');
    userMsg.className = 'flex justify-end';
    const userBubble = document.createElement('div');
    userBubble.className = 'bg-gradient-to-r from-emeraldGreen to-skyBlue text-white text-xs px-3 py-2 rounded-2xl rounded-tr-none max-w-[260px] leading-relaxed';
    userBubble.textContent = query;
    userMsg.appendChild(userBubble);
    messages.appendChild(userMsg);

    input.value = '';
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i>';
    lucide.createIcons();
    messages.scrollTop = messages.scrollHeight;

    // Typing indicator
    const typingId = 'rag-typing-' + Date.now();
    const typingEl = document.createElement('div');
    typingEl.id = typingId;
    typingEl.className = 'flex items-start space-x-2';
    typingEl.innerHTML = `
        <div class="w-7 h-7 rounded-xl bg-gradient-to-r from-emeraldGreen to-skyBlue flex items-center justify-center text-white font-bold text-[10px] shrink-0">AI</div>
        <div class="glass-panel p-3 rounded-2xl rounded-tl-none border border-glassBorder text-xs text-gray-400 flex items-center space-x-1">
            <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style="animation-delay:0ms"></span>
            <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style="animation-delay:150ms"></span>
            <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style="animation-delay:300ms"></span>
        </div>`;
    messages.appendChild(typingEl);
    messages.scrollTop = messages.scrollHeight;

    try {
        const data = await EchoTraceAPI.ragQuery(query, 3, category || 'all');

        // Remove typing indicator
        document.getElementById(typingId)?.remove();

        // Response is nested under data.rag
        const rag = data.rag || {};
        const answer = rag.answer || rag.response || data.answer || 'No answer returned.';
        const sources = rag.sources || data.sources || [];
        const similarity = Number.isFinite(Number(rag.retrieval_similarity)) ? Math.round(Number(rag.retrieval_similarity)) : null;

        // Format answer — replace **bold** markdown with <b> tags
        const formattedAnswer = answer.replace(/\*\*(.*?)\*\*/g, '<b class="text-white">$1</b>').replace(/\n/g, '<br>');

        // Format source titles
        const sourceTitles = sources.map(s => typeof s === 'object' ? s.title : s).filter(Boolean);

        const aiMsg = document.createElement('div');
        aiMsg.className = 'flex items-start space-x-2';
        const aiIcon = document.createElement('div');
        aiIcon.className = 'w-7 h-7 rounded-xl bg-gradient-to-r from-emeraldGreen to-skyBlue flex items-center justify-center text-white font-bold text-[10px] shrink-0';
        aiIcon.textContent = 'AI';
        const aiBubble = document.createElement('div');
        aiBubble.className = 'glass-panel p-3 rounded-2xl rounded-tl-none border border-glassBorder text-xs text-gray-300 leading-relaxed max-w-[280px] space-y-2';
        const answerEl = document.createElement('p');
        answerEl.style.whiteSpace = 'pre-line';
        answerEl.textContent = answer;
        aiBubble.appendChild(answerEl);
        if (similarity != null) {
            const similarityEl = document.createElement('p');
            similarityEl.className = 'text-[10px] text-emerald-400 font-semibold';
            similarityEl.textContent = `Retrieval similarity: ${similarity}% (relevance, not confidence)`;
            aiBubble.appendChild(similarityEl);
        }
        if (sourceTitles.length) {
            const sourcesEl = document.createElement('div');
            sourcesEl.className = 'text-[10px] text-gray-500 border-t border-glassBorder pt-1 mt-1';
            sourcesEl.textContent = `Sources: ${sourceTitles.join(', ')}`;
            aiBubble.appendChild(sourcesEl);
        }
        aiMsg.append(aiIcon, aiBubble);
        messages.appendChild(aiMsg);

    } catch (err) {
        document.getElementById(typingId)?.remove();
        const errMsg = document.createElement('div');
        errMsg.className = 'flex items-start space-x-2';
        errMsg.innerHTML = `
            <div class="w-7 h-7 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 font-bold text-[10px] shrink-0">!</div>
            <div class="glass-panel p-3 rounded-2xl rounded-tl-none border border-rose-500/20 text-xs text-rose-400 max-w-[260px]">
                Could not reach AI service. Make sure Python AI is running on port 5000.
            </div>`;
        messages.appendChild(errMsg);
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i>';
        lucide.createIcons();
        messages.scrollTop = messages.scrollHeight;
    }
};

// Legacy manual scan cleanup alias (handled by primary closeScanModal)
const resetLegacyManualScanState = () => {
    if (typeof manualScanController !== 'undefined' && manualScanController) manualScanController.abort();
    if (typeof manualReviewRequest !== 'undefined') manualReviewRequest = null;
    document.getElementById('scan-modal')?.classList.add('hidden');
    document.getElementById('scan-form')?.reset();
    document.getElementById('scan-error')?.classList.add('hidden');
    const fileInput = document.getElementById('manual-review-file');
    if (fileInput) fileInput.value = '';
    if (typeof uploadedReviewFile !== 'undefined') uploadedReviewFile = null;
    if (typeof uploadedReviewPreview !== 'undefined') uploadedReviewPreview = null;
    document.getElementById('manual-file-preview')?.classList.add('hidden');
    document.getElementById('manual-file-submit-btn')?.setAttribute('disabled', 'disabled');
};

const validateProductSelection = () => {
    const platform = document.getElementById('scan-platform').value.trim();
    const title = document.getElementById('scan-title').value.trim();
    const url = document.getElementById('scan-url').value.trim();
    const rating = document.getElementById('scan-rating').value;

    // Check if all required product fields are filled
    const isValid = platform &&
        title && title.length >= 5 &&
        url && url.startsWith('http') &&
        rating && !isNaN(parseFloat(rating)) &&
        parseFloat(rating) >= 0 && parseFloat(rating) <= 5;

    const btn = document.getElementById('product-confirm-btn');
    if (isValid) {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        btn.classList.add('opacity-100', 'cursor-pointer', 'hover:scale-102');
    } else {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.classList.remove('opacity-100', 'cursor-pointer', 'hover:scale-102');
    }
};

const confirmProductSelection = () => {
    const platform = document.getElementById('scan-platform').value.trim();
    const title = document.getElementById('scan-title').value.trim();
    const url = document.getElementById('scan-url').value.trim();
    const rating = document.getElementById('scan-rating').value;

    // Final validation
    if (!platform || title.length < 5 || !url.startsWith('http') ||
        isNaN(parseFloat(rating)) || parseFloat(rating) < 0 || parseFloat(rating) > 5) {
        alert('Please fill all product details correctly.');
        return;
    }

    // Disable product selection inputs
    document.getElementById('scan-platform').disabled = true;
    document.getElementById('scan-title').disabled = true;
    document.getElementById('scan-image').disabled = true;
    document.getElementById('scan-rating').disabled = true;
    document.getElementById('scan-url').disabled = true;
    document.getElementById('product-confirm-btn').disabled = true;
    document.getElementById('product-confirm-btn').classList.add('opacity-50');

    // Show review input section
    document.getElementById('review-input-section').classList.remove('hidden');

    // Focus on reviews textarea
    setTimeout(() => {
        document.getElementById('scan-reviews').focus();
        lucide.createIcons();
    }, 300);
};

const resetProductSelection = () => {
    if (!document.getElementById('scan-platform')) return;
    // Re-enable product inputs
    document.getElementById('scan-platform').disabled = false;
    document.getElementById('scan-title').disabled = false;
    document.getElementById('scan-image').disabled = false;
    document.getElementById('scan-rating').disabled = false;
    document.getElementById('scan-url').disabled = false;
    document.getElementById('product-confirm-btn').disabled = true;
    document.getElementById('product-confirm-btn').classList.remove('opacity-100');
    document.getElementById('product-confirm-btn').classList.add('opacity-50');

    // Hide review input section
    document.getElementById('review-input-section').classList.add('hidden');
    document.getElementById('scan-reviews').value = '';
};

const legacySubmitScan = async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('scan-error');
    const loaderEl = document.getElementById('scan-loader');

    errorEl.classList.add('hidden');

    // Get product data (already validated during confirmation)
    const platform = document.getElementById('scan-platform').value.trim();
    const title = document.getElementById('scan-title').value.trim();
    const url = document.getElementById('scan-url').value.trim();
    const rating = parseFloat(document.getElementById('scan-rating').value);
    const image = document.getElementById('scan-image').value || '';

    // Validate reviews (only step at this point)
    const rawReviews = document.getElementById('scan-reviews').value.trim();
    if (!rawReviews) {
        errorEl.textContent = "❌ Please provide at least one review to scan.";
        errorEl.classList.remove('hidden');
        return;
    }

    loaderEl.classList.remove('hidden');

    let reviewsList = [];
    try {
        if (rawReviews.startsWith('[') || rawReviews.startsWith('{')) {
            reviewsList = JSON.parse(rawReviews);
            if (!Array.isArray(reviewsList)) {
                reviewsList = [reviewsList];
            }
        } else {
            // Text by line
            reviewsList = rawReviews.split('\n').filter(l => l.trim() !== '').map((line, idx) => ({
                id: `M${idx}`,
                author: `User_${idx}`,
                rating: 5,
                text: line.trim(),
                date: 'Recent'
            }));
        }
    } catch (err) {
        loaderEl.classList.add('hidden');
        errorEl.textContent = "Reviews format invalid. Provide a valid JSON list or standard text lines.";
        errorEl.classList.remove('hidden');
        return;
    }

    if (reviewsList.length === 0) {
        loaderEl.classList.add('hidden');
        errorEl.textContent = "No valid reviews found. Please check your review input format.";
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        const currentUser = EchoTraceAuth.getUser();
        const payload = {
            user_id: currentUser ? currentUser.id : null,
            platform,
            external_id: '',
            title,
            url,
            image_url: image,
            rating,
            reviews: reviewsList
        };

        const res = await EchoTraceAPI.post('scan', payload);
        loaderEl.classList.add('hidden');
        if (res.success && res.scan_id) {
            closeScanModal();
            showNotification('✓ Scan completed! Check your dashboard for results.', 'success');

            // Refresh dashboard to show the new scan
            setTimeout(() => {
                loadDashboardData();
            }, 500);
        } else {
            errorEl.textContent = res.error || "Analysis execute failure.";
            errorEl.classList.remove('hidden');
        }
    } catch (err) {
        loaderEl.classList.add('hidden');
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
    }
};

let manualStageTimer = null;
let manualScanStartedAt = 0;

const getManualAnalysisOptions = () => ({
    detect_duplicates: document.getElementById('analysis-detect-duplicates')?.checked !== false,
    show_explanations: document.getElementById('analysis-show-explanations')?.checked !== false,
    detect_language: document.getElementById('analysis-detect-language')?.checked !== false,
    include_uncertain: document.getElementById('analysis-include-uncertain')?.checked !== false,
    show_confidence: document.getElementById('analysis-show-confidence')?.checked !== false
});

const ensureManualProgressMarkup = () => {
    const steps = document.getElementById('manual-scan-steps');
    if (!steps || document.getElementById('manual-stage-label')) return;
    steps.innerHTML = '<div class="flex items-center justify-between gap-3"><span id="manual-stage-label" class="font-semibold text-gray-200">Working</span><span id="manual-stage-elapsed" class="text-[10px] text-gray-500">0s elapsed</span></div><div class="grid grid-cols-2 gap-2 sm:grid-cols-3"><span id="manual-stage-validate" class="rounded-lg border px-2 py-1.5 text-[10px]">1. Validate input</span><span id="manual-stage-extract" class="rounded-lg border px-2 py-1.5 text-[10px]">2. Extract reviews</span><span id="manual-stage-dedupe" class="rounded-lg border px-2 py-1.5 text-[10px]">3. Remove duplicates</span><span id="manual-stage-language" class="rounded-lg border px-2 py-1.5 text-[10px]">4. Detect languages</span><span id="manual-stage-ai" class="rounded-lg border px-2 py-1.5 text-[10px]">5. Run AI analysis</span><span id="manual-stage-report" class="rounded-lg border px-2 py-1.5 text-[10px]">6. Generate report</span></div><div class="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500"><span>Extracted: <strong id="manual-progress-extracted" class="text-gray-300">0</strong></span><span>Analyzed: <strong id="manual-progress-analyzed" class="text-gray-300">0</strong></span><span id="manual-progress-note">Progress is reported from completed stages only.</span></div>';
};

const setManualStage = (stage, label, details = '') => {
    const labels = { validate: '1. Validate input', extract: '2. Extract reviews', dedupe: '3. Remove duplicates', language: '4. Detect languages', ai: '5. Run AI analysis', report: '6. Generate report' };
    const order = Object.keys(labels);
    const current = order.indexOf(stage);
    order.forEach((name, index) => {
        const element = document.getElementById(`manual-stage-${name}`);
        if (!element) return;
        element.classList.remove('border-cyan-400/20', 'bg-cyan-400/5', 'text-gray-300', 'border-emerald-400/20', 'bg-emerald-400/5', 'text-emerald-200');
        if (index < current) element.classList.add('border-emerald-400/20', 'bg-emerald-400/5', 'text-emerald-200');
        else if (index === current) element.classList.add('border-cyan-400/20', 'bg-cyan-400/5', 'text-gray-300');
        else element.classList.add('text-gray-500');
    });
    const labelElement = document.getElementById('manual-stage-label');
    if (labelElement) labelElement.textContent = label || labels[stage] || 'Working';
    const detailElement = document.getElementById('manual-loader-detail');
    if (detailElement && details) detailElement.textContent = details;
    const status = document.getElementById('manual-analysis-status');
    if (status) { status.classList.remove('hidden'); status.lastChild.textContent = ` ${label || labels[stage] || 'Working'}`; }
};

const beginManualProgress = (label = 'Working') => {
    ensureManualProgressMarkup();
    manualScanStartedAt = Date.now();
    if (manualStageTimer) clearInterval(manualStageTimer);
    manualStageTimer = setInterval(() => {
        const elapsed = Math.max(0, Math.floor((Date.now() - manualScanStartedAt) / 1000));
        const element = document.getElementById('manual-stage-elapsed');
        if (element) element.textContent = `${elapsed}s elapsed`;
    }, 250);
    document.getElementById('manual-scan-steps')?.classList.remove('hidden');
    document.getElementById('scan-loader')?.classList.remove('hidden');
    const loaderTitle = document.getElementById('manual-loader-title');
    if (loaderTitle) loaderTitle.textContent = label;
    setManualStage('validate', label, 'No results are saved until analysis completes.');
};

const finishManualProgress = (label = 'Ready') => {
    if (manualStageTimer) clearInterval(manualStageTimer);
    manualStageTimer = null;
    const elapsed = Math.max(0, Math.floor((Date.now() - manualScanStartedAt) / 1000));
    const element = document.getElementById('manual-stage-elapsed');
    if (element && manualScanStartedAt) element.textContent = `${elapsed}s elapsed`;
    const status = document.getElementById('manual-analysis-status');
    if (status) status.lastChild.textContent = ` ${label}`;
};

const cancelManualScan = () => {
    if (manualScanController) manualScanController.abort();
    if (manualReviewRequest) manualReviewRequest = null;
    finishManualProgress('Cancelled');
    document.getElementById('scan-loader')?.classList.add('hidden');
    const error = document.getElementById('scan-error');
    if (error) { error.textContent = 'Scan cancelled. No result was saved.'; error.classList.remove('hidden'); }
};

window.cancelManualScan = cancelManualScan;

const submitScan = async (e) => {
    e.preventDefault();
    if (manualScanController) return;
    const errorEl = document.getElementById('scan-error');
    const loaderEl = document.getElementById('scan-loader');
    const url = document.getElementById('manual-product-url')?.value.trim();
    const steps = document.getElementById('manual-scan-steps');
    const preview = document.getElementById('manual-platform-preview');
    const alternative = document.getElementById('manual-scan-alternative');
    const submitButton = document.getElementById('scan-submit-btn');
    errorEl.classList.add('hidden');
    if (!url) { errorEl.textContent = 'Paste a product URL to continue.'; errorEl.classList.remove('hidden'); return; }
    manualScanResult = null;
    document.getElementById('manual-scan-result')?.classList.add('hidden');
    document.getElementById('manual-view-report')?.classList.add('hidden');
    steps.classList.remove('hidden'); preview.classList.add('hidden'); alternative.classList.add('hidden');
    beginManualProgress('Validating product URL');
    setManualStage('extract', 'Retrieving publicly accessible reviews', 'The server is checking the marketplace response.');
    if (submitButton) submitButton.disabled = true;
    manualScanController = new AbortController();
    try {
        const result = await EchoTraceAPI.post('scan/manual', { url, options: getManualAnalysisOptions() }, { signal: manualScanController.signal });
        preview.textContent = `Detected platform: ${String(result.platform || '').replace(/^./, c => c.toUpperCase())}`;
        preview.classList.remove('hidden');
        if (!result.success || !result.scan_id) throw new Error(result.error || 'The audit could not be completed.');
        handleManualScanResult(result);
    } catch (error) {
        loaderEl.classList.add('hidden');
        finishManualProgress(error.name === 'AbortError' ? 'Cancelled' : 'Stopped');
        setManualStage('report', error.name === 'AbortError' ? 'Scan cancelled' : 'Audit stopped without saving a scan');
        const failureGuidance = {
            dns_failure: 'The EchoTrace server could not resolve the marketplace host. Check the server DNS/network configuration and try again.',
            timeout: 'The marketplace connection timed out. It may be slow or temporarily unavailable from the server.',
            connection_failure: 'The marketplace refused or blocked the EchoTrace server connection. Allow outbound HTTPS from PHP or configure ECHOTRACE_HTTPS_PROXY, then retry. The optional Chrome extension can scan reviews visible in your browser.',
            tls_failure: 'The server could not verify the marketplace certificate. Update the server CA bundle; TLS verification remains enabled.',
            blocked_access: 'The marketplace blocked server-side access or requires authentication. Use the optional Chrome extension for reviews visible in your browser.',
            forbidden_access: 'The marketplace returned HTTP 403 or requires authentication. Use the optional Chrome extension for reviews visible in your browser.',
            rate_limited: 'The marketplace returned HTTP 429 and rate-limited the server. Wait a moment, then retry or use the browser-visible review fallback.',
            reviews_unavailable: 'The public product response did not contain reviews. The marketplace may require JavaScript, login, or a permitted API.',
            extraction_failure: 'The product response could not be parsed safely. No review data was saved.',
            ai_service_unavailable: 'The reviews were retrieved, but the EchoTrace AI service is unavailable. No scan was saved.',
            ai_service_error: 'The reviews were retrieved, but the EchoTrace AI service returned an invalid result. No scan was saved.'
        };
        alternative.textContent = failureGuidance[error.code] || 'No scan was saved. Check the error above and try again. The optional Chrome extension remains available for browser-visible reviews.';
        alternative.classList.remove('hidden');
        document.getElementById('manual-scan-fallbacks')?.classList.remove('hidden');
        errorEl.textContent = error.message || 'The product URL could not be validated.';
        errorEl.classList.remove('hidden');
    } finally {
        manualScanController = null;
        if (submitButton) submitButton.disabled = false;
    }
};

let manualScanResult = null;
let manualScanController = null;
let manualReviewRequest = null;
let activeManualMethod = 'product';
let uploadedReviewFile = null;
let uploadedReviewPreview = null;

const switchManualMethod = (method) => {
    activeManualMethod = ['product', 'paste', 'file'].includes(method) ? method : 'product';
    document.querySelectorAll('[data-manual-method-panel]').forEach(panel => {
        panel.classList.toggle('hidden', panel.dataset.manualMethodPanel !== activeManualMethod);
    });
    document.querySelectorAll('#manual-method-tabs [role="tab"]').forEach(tab => {
        const selected = tab.id === `manual-tab-${activeManualMethod}`;
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.classList.toggle('bg-emerald-500/20', selected);
        tab.classList.toggle('text-emerald-200', selected);
        tab.classList.toggle('text-gray-400', !selected);
    });
    if (activeManualMethod === 'paste') updatePasteTabStats();
};

const parseManualReviewText = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return [];
    if (text.startsWith('[')) {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
    }
    return text.split(/\n\s*\n/).map((entry, index) => ({ id: `paste-${index + 1}`, text: entry.trim() })).filter(review => review.text);
};

const updatePasteTabStats = () => {
    const field = document.getElementById('manual-tab-paste-text');
    if (!field) return;
    let reviews = [];
    try { reviews = parseManualReviewText(field.value); } catch (_) { reviews = []; }
    const seen = new Set();
    let duplicates = 0;
    reviews.forEach(review => {
        const key = String(review?.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!key) return;
        if (seen.has(key)) duplicates += 1;
        seen.add(key);
    });
    const count = document.getElementById('manual-paste-review-count');
    const duplicate = document.getElementById('manual-paste-duplicates');
    const chars = document.getElementById('manual-paste-char-count');
    if (count) count.textContent = `${seen.size} review${seen.size === 1 ? '' : 's'}`;
    if (duplicate) duplicate.textContent = `${duplicates} duplicate${duplicates === 1 ? '' : 's'}`;
    if (chars) chars.textContent = `${field.value.length} characters`;
};

const clearManualPasteTab = () => {
    const field = document.getElementById('manual-tab-paste-text');
    if (field) field.value = '';
    updatePasteTabStats();
};

const renderUploadedPreview = (data) => {
    const preview = document.getElementById('manual-file-preview');
    const tableHost = document.getElementById('manual-file-preview-table');
    if (!preview || !tableHost) return;
    tableHost.textContent = '';
    const table = document.createElement('table');
    table.className = 'min-w-full text-left';
    const rows = Array.isArray(data.preview) ? data.preview : [];
    const columns = Array.isArray(data.columns) ? data.columns : [];
    const head = table.createTHead().insertRow();
    columns.forEach(column => { const cell = document.createElement('th'); cell.className = 'px-2 py-1 text-gray-400'; cell.textContent = column; head.appendChild(cell); });
    rows.slice(0, 5).forEach(row => {
        const tr = table.insertRow();
        columns.forEach((_, index) => { const cell = tr.insertCell(); cell.className = 'max-w-[180px] truncate px-2 py-1 text-gray-300'; cell.textContent = String(row?.[index] ?? ''); });
    });
    tableHost.appendChild(table);
    preview.classList.remove('hidden');
    const status = document.getElementById('manual-file-status');
    if (status) status.textContent = `${data.total_valid} valid review${data.total_valid === 1 ? '' : 's'} found; ${data.duplicates_removed || 0} duplicate${Number(data.duplicates_removed || 0) === 1 ? '' : 's'} removed. Select the review column and analyze when ready.`;
    const selects = [['manual-file-text-column', true], ['manual-file-author-column', false], ['manual-file-rating-column', false], ['manual-file-date-column', false]];
    selects.forEach(([id, required]) => {
        const select = document.getElementById(id);
        if (!select) return;
        select.textContent = '';
        if (!required) { const option = document.createElement('option'); option.value = ''; option.textContent = 'Not provided'; select.appendChild(option); }
        columns.forEach(column => { const option = document.createElement('option'); option.value = column; option.textContent = column; select.appendChild(option); });
        if (required) {
            const preferred = columns.find(column => ['review', 'review_text', 'text', 'comment', 'content', 'body'].includes(column.toLowerCase().replace(/[^a-z0-9]+/g, '_')));
            if (preferred) select.value = preferred;
        }
    });
    document.getElementById('manual-file-submit-btn')?.removeAttribute('disabled');
};

const handleReviewFileSelection = (event) => {
    const file = event.target.files?.[0];
    const status = document.getElementById('manual-file-status');
    uploadedReviewFile = null;
    uploadedReviewPreview = null;
    document.getElementById('manual-file-preview')?.classList.add('hidden');
    document.getElementById('manual-file-submit-btn')?.setAttribute('disabled', 'disabled');
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) { if (status) status.textContent = 'Choose a CSV or XLSX file.'; return; }
    if (file.size > 5 * 1024 * 1024) { if (status) status.textContent = 'The file must be smaller than 5 MB.'; return; }
    uploadedReviewFile = file;
    previewUploadedReviews();
};

const previewUploadedReviews = async () => {
    if (!uploadedReviewFile) return;
    const status = document.getElementById('manual-file-status');
    if (status) status.textContent = 'Reading the review file…';
    const form = new FormData();
    form.append('file', uploadedReviewFile);
    form.append('preview', 'true');
    try {
        const result = await EchoTraceAPI.upload('scan/uploaded-reviews', form);
        if (!result?.success) throw new Error(result?.error || 'The review file could not be read.');
        uploadedReviewPreview = result;
        renderUploadedPreview(result);
    } catch (error) {
        if (status) status.textContent = error.message || 'The review file could not be read.';
    }
};

const submitPasteTab = () => {
    const field = document.getElementById('manual-tab-paste-text');
    let reviews;
    try { reviews = parseManualReviewText(field?.value || ''); } catch (_) { showManualFallbackError('The pasted review data is not valid JSON or separated review text.'); return; }
    const unique = [];
    const seen = new Set();
    reviews.forEach(review => { const text = String(review?.text || '').trim(); const key = text.replace(/\s+/g, ' ').toLowerCase(); if (text && !seen.has(key)) { seen.add(key); unique.push({ ...review, text }); } });
    if (!unique.length) { showManualFallbackError('Paste real customer review text first.'); return; }
    submitManualReviews('', { reviews: unique }, 'manual_paste');
};

const submitUploadedReviews = () => {
    if (manualScanController || !uploadedReviewFile || !uploadedReviewPreview) return;
    const form = new FormData();
    form.append('file', uploadedReviewFile);
    form.append('preview', 'false');
    form.append('options', JSON.stringify(getManualAnalysisOptions()));
    form.append('mapping', JSON.stringify({
        text: document.getElementById('manual-file-text-column')?.value || '',
        author: document.getElementById('manual-file-author-column')?.value || '',
        rating: document.getElementById('manual-file-rating-column')?.value || '',
        date: document.getElementById('manual-file-date-column')?.value || ''
    }));
    const loader = document.getElementById('scan-loader');
    const error = document.getElementById('scan-error');
    const submitButton = document.getElementById('manual-file-submit-btn');
    error?.classList.add('hidden');
    loader?.classList.remove('hidden');
    submitButton?.setAttribute('disabled', 'disabled');
    beginManualProgress('Reading uploaded dataset');
    setManualStage('extract', 'Reading uploaded dataset', 'Validating the file and preparing a preview.');
    manualScanController = new AbortController();
    EchoTraceAPI.upload('scan/uploaded-reviews', form, { signal: manualScanController.signal }).then(result => {
        if (!result?.success || !result.scan_id) throw new Error(result?.error || 'The review analysis was not saved.');
        handleManualScanResult(result);
    }).catch(scanError => showManualFallbackError(scanError.message || 'The review file could not be analyzed.')).finally(() => { manualScanController = null; submitButton?.removeAttribute('disabled'); });
};

window.switchManualMethod = switchManualMethod;
window.updatePasteTabStats = updatePasteTabStats;
window.clearManualPasteTab = clearManualPasteTab;
window.handleReviewFileSelection = handleReviewFileSelection;
window.previewUploadedReviews = previewUploadedReviews;
window.submitUploadedReviews = submitUploadedReviews;
window.submitPasteTab = submitPasteTab;
const handleManualScanResult = (result) => {
    document.getElementById('scan-loader')?.classList.add('hidden');
    const totalResultCount = Number(result.metrics?.total_scanned ?? result.extracted_count ?? (result.results || []).length);
    const analyzedProgress = document.getElementById('manual-progress-analyzed');
    const extractedProgress = document.getElementById('manual-progress-extracted');
    if (extractedProgress) extractedProgress.textContent = String(totalResultCount);
    if (analyzedProgress) analyzedProgress.textContent = String(totalResultCount);
    setManualStage('report', 'Report generated', `${totalResultCount} real review${totalResultCount === 1 ? '' : 's'} analyzed and saved.`);
    finishManualProgress('Complete');
    manualScanResult = result;
    const metrics = result.metrics || {};
    const total = Number(metrics.total_scanned ?? result.extracted_count ?? (result.results || []).length);
    const suspicious = Number(metrics.fake_detected ?? 0);
    const genuine = Number(metrics.genuine_detected ?? 0);
    const uncertain = Number(metrics.uncertain_detected ?? 0);
    document.getElementById('manual-result-trust').textContent = `${Number(result.trust_score || 0).toFixed(2)}%`;
    document.getElementById('manual-result-total').textContent = String(total);
    document.getElementById('manual-result-genuine').textContent = String(genuine);
    document.getElementById('manual-result-suspicious').textContent = String(suspicious);
    document.getElementById('manual-result-uncertain').textContent = String(uncertain);
    document.getElementById('manual-scan-result')?.classList.remove('hidden');
    document.getElementById('manual-view-report')?.classList.remove('hidden');
    const stageNote = result.duplicate_request
        ? `This exact ${total}-review audit was already saved. The existing report is shown below.`
        : `Audit complete. ${total} real customer review${total === 1 ? '' : 's'} extracted, analyzed, and saved.`;
    const progressNote = document.getElementById('manual-progress-note');
    if (progressNote) progressNote.textContent = stageNote;
    loadDashboardData();
    showNotification(result.duplicate_request ? 'Existing audit report loaded.' : 'Manual product audit completed and saved.', 'success');
};

const handleManualExtensionResult = (result) => {
    const loader = document.getElementById('scan-loader'); loader?.classList.add('hidden');
    if (!result?.success || !result.scan_id) return handleManualExtensionFailure('The extension did not return a saved scan result.');
    handleManualScanResult(result);
};
const handleManualExtensionFailure = (message) => { document.getElementById('scan-loader')?.classList.add('hidden'); finishManualProgress('Stopped'); const error = document.getElementById('scan-error'); error.textContent = message || 'Review extraction could not be completed.'; error.classList.remove('hidden'); };
const showManualFallbackError = (message) => {
    document.getElementById('scan-loader')?.classList.add('hidden');
    finishManualProgress('Stopped');
    const error = document.getElementById('scan-error');
    if (error) { error.textContent = message || 'Review extraction could not be completed.'; error.classList.remove('hidden'); }
    document.getElementById('manual-scan-fallbacks')?.classList.remove('hidden');
};

const submitManualReviews = async (url, data, source) => {
    if (manualScanController) return;
    const reviews = Array.isArray(data?.reviews) ? data.reviews.filter(review => review && typeof review.text === 'string' && review.text.trim()) : [];
    if (!reviews.length) { showManualFallbackError('No actual customer reviews were extracted. Nothing was saved.'); return; }
    const steps = document.getElementById('manual-scan-steps');
    const loader = document.getElementById('scan-loader');
    const error = document.getElementById('scan-error');
    error?.classList.add('hidden');
    document.getElementById('manual-scan-fallbacks')?.classList.add('hidden');
    loader?.classList.remove('hidden');
    beginManualProgress('Preparing real reviews');
    const extracted = document.getElementById('manual-progress-extracted');
    if (extracted) extracted.textContent = String(reviews.length);
    setManualStage('dedupe', 'Removing duplicates', `${reviews.length} submitted review${reviews.length === 1 ? '' : 's'} received.`);
    if (steps) steps.textContent = `1. Browser extraction returned ${reviews.length} real review${reviews.length === 1 ? '' : 's'}…\n2. Sending reviews to the EchoTrace AI model…\n3. Saving the isolated audit report…`;
    manualScanController = new AbortController();
    try {
        ensureManualProgressMarkup();
        setManualStage('ai', 'Running AI analysis', 'Sending the submitted reviews to the EchoTrace model.');
        const result = await EchoTraceAPI.post('scan/manual-reviews', {
            url,
            reviews: reviews.slice(0, 100),
            metadata: { title: data.title || '', external_id: data.external_id || '', image_url: data.image_url || '', rating: data.rating ?? 0 },
            source,
            options: getManualAnalysisOptions()
        }, { signal: manualScanController.signal });
        if (!result?.success || !result.scan_id) throw new Error(result?.error || 'The review analysis was not saved.');
        handleManualScanResult(result);
    } catch (scanError) {
        showManualFallbackError(scanError.message || 'The review analysis could not be saved.');
    } finally {
        manualScanController = null;
        manualReviewRequest = null;
    }
};

const requestBrowserReviewScan = () => {
    if (manualReviewRequest || manualScanController) return;
    const url = document.getElementById('manual-product-url')?.value.trim();
    if (!url) { showManualFallbackError('Paste the product URL first.'); return; }
    const requestId = `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    manualReviewRequest = { id: requestId, url };
    beginManualProgress('Waiting for extension');
    document.getElementById('scan-loader')?.classList.remove('hidden');
    const steps = document.getElementById('manual-scan-steps');
    if (steps) { steps.classList.remove('hidden'); steps.textContent = '1. Waiting for the EchoTrace extension…\n2. Reading only reviews currently visible in the product tab…'; }
    window.postMessage({ source: 'ECHOTRACE_DASHBOARD', type: 'REQUEST_ACTIVE_TAB_REVIEWS', request_id: requestId, url }, window.location.origin);
    ensureManualProgressMarkup();
    setManualStage('extract', 'Reading visible product reviews', 'Waiting for the EchoTrace extension response.');
    window.setTimeout(() => {
        if (manualReviewRequest?.id !== requestId) return;
        manualReviewRequest = null;
        showManualFallbackError('The extension did not respond. Reload the EchoTrace extension and product tab, then retry or paste the reviews below.');
    }, 12000);
};

const handleManualReviewsResponse = (message) => {
    if (!manualReviewRequest || message.request_id !== manualReviewRequest.id) return;
    const requestedUrl = manualReviewRequest.url;
    manualReviewRequest = null;
    if (message.error) { showManualFallbackError(message.error); return; }
    const data = message.data;
    const reviews = Array.isArray(data?.reviews) ? data.reviews : [];
    if (!reviews.length) { showManualFallbackError('The active product tab exposed no customer review text. Nothing was saved.'); return; }
    submitManualReviews(data.url || requestedUrl, data, 'extension_visible_reviews');
};

const toggleManualPaste = () => {
    document.getElementById('manual-paste-panel')?.classList.toggle('hidden');
};

const submitManualPaste = () => {
    const url = document.getElementById('manual-product-url')?.value.trim();
    const raw = document.getElementById('manual-review-paste')?.value.trim() || '';
    if (!url) { showManualFallbackError('Paste the product URL first.'); return; }
    if (!raw) { showManualFallbackError('Paste real customer review text first.'); return; }
    let reviews;
    try {
        reviews = raw.startsWith('[') ? JSON.parse(raw) : raw.split(/\n\s*\n/).map((text, index) => ({ id: `paste-${index + 1}`, text: text.trim() })).filter(review => review.text);
    } catch (_) {
        showManualFallbackError('The pasted review data is not valid JSON or separated review text.');
        return;
    }
    submitManualReviews(url, { reviews }, 'manual_paste');
};

window.requestBrowserReviewScan = requestBrowserReviewScan;
window.toggleManualPaste = toggleManualPaste;
window.submitManualPaste = submitManualPaste;
const openManualScanReport = () => { if (manualScanResult?.scan_id) { closeScanModal(); openDashboardFullReport(manualScanResult.scan_id); } };

// --- REPORT ANALYSIS ACTIONS ---

const closeResultsModal = () => {
    const modal = document.getElementById('results-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.removeAttribute('aria-busy');
    }
};

const showReportModalStatus = (message, isError = false) => {
    const modal = document.getElementById('results-modal');
    const status = document.getElementById('modal-report-status');
    if (!modal || !status) return;
    status.className = `p-4 rounded-xl border text-sm ${isError ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-sky-500/10 border-sky-500/30 text-sky-300'}`;
    status.textContent = message;
    status.classList.remove('hidden');
    document.getElementById('modal-report-content')?.classList.add('hidden');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-busy', isError ? 'false' : 'true');
};

const PRODUCT_IMAGE_PLACEHOLDER = 'assets/product-placeholder.svg';

const setReportProductImage = (imageElement, rawImageUrl) => {
    if (!imageElement) return;

    const usePlaceholder = () => {
        if (imageElement.dataset.placeholderApplied === 'true') return;
        imageElement.dataset.placeholderApplied = 'true';
        imageElement.src = PRODUCT_IMAGE_PLACEHOLDER;
        imageElement.alt = 'Product image unavailable';
        imageElement.title = 'No verified product image is available';
        imageElement.className = imageElement.className
            .replace(/object-cover|object-contain/g, '')
            .concat(' object-contain p-2');
    };

    imageElement.dataset.placeholderApplied = 'false';
    imageElement.onerror = usePlaceholder;
    const candidate = String(rawImageUrl || '').trim();
    if (!candidate) {
        usePlaceholder();
        return;
    }

    try {
        const parsed = new URL(candidate, window.location.origin);
        const sameOriginHttp = parsed.protocol === 'http:' && parsed.origin === window.location.origin;
        const secureExternal = parsed.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
        if ((!sameOriginHttp && !secureExternal) || parsed.username || parsed.password) {
            usePlaceholder();
            return;
        }
        imageElement.alt = 'Verified product image';
        imageElement.title = 'Verified product image';
        imageElement.src = parsed.href;
    } catch (_) {
        usePlaceholder();
    }
};

const openDashboardFullReport = async (scanId) => {
    if (!scanId) {
        showNotification('The full report is not available for this scan.', 'error');
        return;
    }
    scanId = String(scanId);
    if (loadingReportScanId === scanId) return;
    loadingReportScanId = scanId;
    const requestId = ++reportRequestSequence;
    sessionStorage.setItem('echotrace_selected_scan_id', String(scanId));
    if (window.location.hash !== '#dashboard') navigateTo('dashboard');
    else loadDashboardData();

    const modal = document.getElementById('results-modal');
    if (modal) modal.dataset.scanId = String(scanId);
    showReportModalStatus('Loading the selected report...');

    try {
        const res = await EchoTraceAPI.get(`scan/report&scan_id=${encodeURIComponent(scanId)}`);
        if (requestId !== reportRequestSequence) return;
        if (!res?.success || !res.report) throw new Error(res?.error || 'Report data was not found.');
        loadedReportReviews = Array.isArray(res.reviews) ? res.reviews : [];
        loadedReportData = { ...res.report, reviews: loadedReportReviews, metrics: res.metrics || null };
        showResultsModal({ ...res.report, scan_id: res.report.scan_id || scanId });
    } catch (error) {
        if (requestId !== reportRequestSequence) return;
        console.error('[EchoTrace] Failed to open dashboard report:', error);
        showReportModalStatus(error.message || 'Unable to load this report.', true);
    } finally {
        if (requestId === reportRequestSequence) loadingReportScanId = null;
    }
};

const openResultsFullReport = () => openDashboardFullReport(
    document.getElementById('results-modal')?.dataset?.scanId || ''
);

const getStoredReviewStatus = (review) => {
    const rawLabel = String(review.classification || '').toLowerCase();
    const confidence = review.confidence_score === null || review.confidence_score === ''
        ? null
        : Number(review.confidence_score);
    const validConfidence = Number.isFinite(confidence) && confidence >= 0 && confidence <= 100;
    const explicitlyUncertain = rawLabel.includes('uncertain')
        || rawLabel.includes('inconclusive')
        || rawLabel.includes('needs review');
    if (explicitlyUncertain || (validConfidence && confidence >= 40 && confidence <= 60)) {
        return { key: 'uncertain', label: 'Needs Review', classes: 'bg-amber-500/10 text-amber-300 border-amber-500/30' };
    }
    if (Number(review.is_fake) === 1) {
        return { key: 'fake', label: 'Potentially Fake', classes: 'bg-rose-500/10 text-rose-300 border-rose-500/30' };
    }
    return { key: 'genuine', label: 'Likely Genuine', classes: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' };
};

const getValidFakeProbability = (review) => {
    if (review.confidence_score === null || review.confidence_score === '') return null;
    const score = Number(review.confidence_score);
    return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
};

const parseStoredList = (value) => {
    if (Array.isArray(value)) return value.filter(item => typeof item === 'string' && item.trim());
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string' && item.trim()) : [];
    } catch (_) {
        return [value.trim()];
    }
};

const getStoredAnalysisDetails = (review) => {
    const details = parseStoredList(review.fake_reasons);
    if (review.sentiment) details.push(`Sentiment: ${review.sentiment}`);
    if (review.emotion) details.push(`Emotion: ${review.emotion}`);
    if (review.intent) details.push(`Intent: ${review.intent}`);
    if (review.duplicate_group_id !== null && review.duplicate_group_id !== '') {
        details.push(`Duplicate group: ${review.duplicate_group_id}`);
    }
    return [...new Set(details)];
};

const reviewHasStoredAnalysis = (review) => review.analysis_id !== null
    && review.analysis_id !== undefined
    && review.analysis_id !== '';

const renderAnalyzedReviews = () => {
    const tableBody = document.getElementById('modal-analyzed-reviews-body');
    const emptyState = document.getElementById('modal-reviews-empty');
    const resultCount = document.getElementById('modal-review-result-count');
    if (!tableBody || !emptyState || !resultCount) return;

    const filter = document.getElementById('modal-review-filter')?.value || 'all';
    const search = (document.getElementById('modal-review-search')?.value || '').trim().toLowerCase();
    const languageFilter = document.getElementById('modal-review-language')?.value || 'all';
    const sort = document.getElementById('modal-review-sort')?.value || 'sequence';
    let rows = (loadedReportReviews || []).map((review, index) => ({ review, sequence: index + 1 }));
    rows = rows.filter(({ review }) => {
        const status = reviewHasStoredAnalysis(review) ? getStoredReviewStatus(review).key : 'incomplete';
        const matchesFilter = filter === 'all' || status === filter;
        const searchable = [review.review_text, review.author, review.title].map(value => String(value || '').toLowerCase()).join(' ');
        const matchesSearch = !search || searchable.includes(search);
        const language = String(review.language || 'Unknown');
        const matchesLanguage = languageFilter === 'all' || language === languageFilter;
        return matchesFilter && matchesSearch && matchesLanguage;
    });

    if (sort === 'classification') {
        const order = { fake: 0, uncertain: 1, genuine: 2, incomplete: 3 };
        rows.sort((a, b) => (order[reviewHasStoredAnalysis(a.review) ? getStoredReviewStatus(a.review).key : 'incomplete']
            - order[reviewHasStoredAnalysis(b.review) ? getStoredReviewStatus(b.review).key : 'incomplete']) || a.sequence - b.sequence);
    } else if (sort === 'confidence-desc' || sort === 'confidence-asc') {
        rows.sort((a, b) => {
            const aScore = getValidFakeProbability(a.review);
            const bScore = getValidFakeProbability(b.review);
            if (aScore === null) return 1;
            if (bScore === null) return -1;
            return sort === 'confidence-desc' ? bScore - aScore : aScore - bScore;
        });
    }

    const totalPages = Math.max(1, Math.ceil(rows.length / reportReviewPageSize));
    reportReviewPage = Math.min(Math.max(1, reportReviewPage), totalPages);
    const pageStart = (reportReviewPage - 1) * reportReviewPageSize;
    const pageRows = rows.slice(pageStart, pageStart + reportReviewPageSize);
    tableBody.replaceChildren();
    resultCount.textContent = `${rows.length} matching of ${(loadedReportReviews || []).length} reviews`;
    emptyState.classList.toggle('hidden', rows.length > 0);
    const pageStatus = document.getElementById('modal-review-page-status');
    const previousButton = document.getElementById('modal-review-prev');
    const nextButton = document.getElementById('modal-review-next');
    if (pageStatus) pageStatus.textContent = rows.length ? `Page ${reportReviewPage} of ${totalPages}` : 'Page 1';
    if (previousButton) previousButton.disabled = reportReviewPage <= 1 || !rows.length;
    if (nextButton) nextButton.disabled = reportReviewPage >= totalPages || !rows.length;
    if (!rows.length) {
        emptyState.textContent = loadedReportReviews.length
            ? 'No reviews match the selected filters.'
            : 'No Reviews Available for Analysis';
        return;
    }

    pageRows.forEach(({ review, sequence }) => {
        const analyzed = reviewHasStoredAnalysis(review);
        const status = analyzed
            ? getStoredReviewStatus(review)
            : { key: 'incomplete', label: 'Analysis Incomplete', classes: 'bg-gray-500/10 text-gray-300 border-gray-500/30' };
        const score = getValidFakeProbability(review);
        const details = getStoredAnalysisDetails(review);
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/5 transition-colors align-top';

        const appendCell = (text, className = 'p-3 text-gray-300') => {
            const td = document.createElement('td');
            td.className = className;
            td.textContent = text;
            tr.appendChild(td);
            return td;
        };
        appendCell(String(sequence), 'p-3 text-gray-500');
        const textCell = appendCell(review.review_text || 'No review text stored.', 'p-3 text-gray-200 min-w-[300px] max-w-xl whitespace-normal');
        textCell.title = review.review_text || '';
        appendCell(review.rating !== null && review.rating !== '' ? `${review.rating}/5` : 'Not available');

        const classCell = document.createElement('td');
        classCell.className = 'p-3';
        const badge = document.createElement('span');
        badge.className = `inline-flex px-2 py-1 rounded-full border font-semibold ${status.classes}`;
        badge.textContent = status.label;
        classCell.appendChild(badge);
        tr.appendChild(classCell);

        appendCell(score === null ? 'Not provided' : `${score.toFixed(1)}% fake probability`, 'p-3 text-gray-300 whitespace-nowrap');
        const detailCell = document.createElement('td');
        detailCell.className = 'p-3 min-w-[180px]';
        const summary = document.createElement('p');
        summary.className = 'text-gray-400 line-clamp-2';
        summary.textContent = details.length ? details.join(' · ') : 'No additional analysis details provided.';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mt-2 text-sky-400 hover:text-sky-300 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500 rounded';
        button.textContent = 'View details';
        button.addEventListener('click', () => showModalReviewDetail(review, sequence));
        detailCell.append(summary, button);
        tr.appendChild(detailCell);
        tableBody.appendChild(tr);
    });
};

const changeReportReviewPage = (delta) => {
    reportReviewPage += Number(delta) || 0;
    renderAnalyzedReviews();
};

const showModalReviewDetail = (review, sequence) => {
    const panel = document.getElementById('modal-review-detail');
    const content = document.getElementById('modal-review-detail-content');
    if (!panel || !content) return;
    const analyzed = reviewHasStoredAnalysis(review);
    const status = analyzed ? getStoredReviewStatus(review).label : 'Analysis Incomplete';
    const score = getValidFakeProbability(review);
    const fields = [
        ['Review', review.review_text || 'No review text stored.'],
        ['Classification', status],
        ['Confidence', score === null ? 'Not provided' : `${score.toFixed(1)}% fake probability`],
        ['Language', review.language || 'Unknown'],
        ['Rating', review.rating !== null && review.rating !== '' ? `${review.rating}/5` : 'Not available'],
        ['Date', review.review_date || 'Not available'],
        ['Analysis details', getStoredAnalysisDetails(review).join(' · ') || 'No additional analysis details provided.']
    ];
    content.replaceChildren();
    fields.forEach(([label, value]) => {
        const wrapper = document.createElement('div');
        wrapper.className = label === 'Review' || label === 'Analysis details' ? 'sm:col-span-2' : '';
        const dt = document.createElement('dt');
        dt.className = 'font-semibold text-gray-500 uppercase tracking-wide';
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.className = 'mt-1 text-gray-200 whitespace-pre-wrap break-words';
        dd.textContent = value;
        wrapper.append(dt, dd);
        content.appendChild(wrapper);
    });
    panel.dataset.reviewSequence = String(sequence);
    panel.classList.remove('hidden');
    panel.focus();
};

const closeModalReviewDetail = () => document.getElementById('modal-review-detail')?.classList.add('hidden');

const formatReportSource = (source) => {
    const labels = {
        server_extractor: 'Server extractor',
        extension_visible_reviews: 'Browser extension',
        screenshot_ocr: 'Screenshot OCR',
        manual_paste: 'Pasted reviews',
        uploaded_dataset: 'Uploaded dataset',
        manual: 'Manual scan'
    };
    return labels[String(source || '').toLowerCase()] || (source ? String(source).replaceAll('_', ' ') : 'Not available');
};

const renderReportDashboardMetrics = (report, reviews, metrics = {}) => {
    const analyzed = reviews.filter(reviewHasStoredAnalysis);
    const counts = {
        genuine: Number(metrics.likely_genuine_count ?? analyzed.filter(review => getStoredReviewStatus(review).key === 'genuine').length),
        fake: Number(metrics.potentially_fake_count ?? analyzed.filter(review => getStoredReviewStatus(review).key === 'fake').length),
        uncertain: Number(metrics.uncertain_count ?? analyzed.filter(review => getStoredReviewStatus(review).key === 'uncertain').length)
    };
    const total = counts.genuine + counts.fake + counts.uncertain;
    const setMetric = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
    setMetric('modal-total-count', total);
    setMetric('modal-fake-count', counts.fake);
    setMetric('modal-genuine-count', counts.genuine);
    setMetric('modal-uncertain-count', counts.uncertain);
    setMetric('modal-distribution-total', `${total} analyzed`);

    const percent = (value) => total ? `${((value / total) * 100).toFixed(1)}%` : '0%';
    setMetric('modal-distribution-genuine', percent(counts.genuine));
    setMetric('modal-distribution-fake', percent(counts.fake));
    setMetric('modal-distribution-uncertain', percent(counts.uncertain));
    const distributionBar = document.getElementById('modal-distribution-bar');
    if (distributionBar) {
        distributionBar.replaceChildren();
        [['genuine', counts.genuine, 'bg-emerald-400'], ['fake', counts.fake, 'bg-rose-400'], ['uncertain', counts.uncertain, 'bg-amber-400']].forEach(([key, value, className]) => {
            if (!value || !total) return;
            const segment = document.createElement('div');
            segment.className = className;
            segment.style.width = `${(value / total) * 100}%`;
            segment.title = `${key}: ${value}`;
            distributionBar.appendChild(segment);
        });
        if (!distributionBar.children.length) {
            const empty = document.createElement('div');
            empty.className = 'w-full bg-white/10';
            distributionBar.appendChild(empty);
        }
    }

    const confidence = metrics.confidence_distribution || {};
    const confidenceBreakdown = document.getElementById('modal-confidence-breakdown');
    if (confidenceBreakdown) {
        confidenceBreakdown.replaceChildren();
        [['High', confidence.high, 'text-emerald-300'], ['Uncertain', confidence.uncertain, 'text-amber-300'], ['Low', confidence.low, 'text-sky-300'], ['Missing', confidence.missing, 'text-gray-400']].forEach(([label, value, color]) => {
            if (!Number(value)) return;
            const badge = document.createElement('span');
            badge.className = `px-2 py-1 rounded border border-glassBorder ${color}`;
            badge.textContent = `${label}: ${value}`;
            confidenceBreakdown.appendChild(badge);
        });
    }
    const average = Number(metrics.average_fake_probability);
    setMetric('modal-average-confidence', Number.isFinite(average) ? `Avg. fake probability ${average.toFixed(1)}%` : 'Not available');

    const coverage = Number(metrics.analysis_coverage_percent);
    setMetric('modal-quality-coverage', Number.isFinite(coverage) ? `${coverage.toFixed(1)}% (${metrics.analyzed_count ?? analyzed.length}/${metrics.review_count ?? reviews.length})` : 'Not available');
    setMetric('modal-quality-duration', Number.isFinite(Number(report.duration_ms)) ? `${Number(report.duration_ms).toLocaleString()} ms` : 'Not recorded');
    setMetric('modal-quality-source', formatReportSource(report.review_source));
    const modalOcrDetails = document.getElementById('modal-ocr-details');
    if (modalOcrDetails) {
        const warnings = Array.isArray(metrics.ocr_warnings) ? metrics.ocr_warnings : [];
        const limitations = Array.isArray(metrics.limitations) ? metrics.limitations : [];
        const details = [...warnings.map(warning => `OCR warning: ${warning}`), ...limitations];
        modalOcrDetails.textContent = details.join('\n');
        modalOcrDetails.classList.toggle('hidden', !details.length);
    }
    const languageCounts = metrics.language_distribution || reviews.reduce((result, review) => {
        const language = String(review.language || 'Unknown');
        result[language] = (result[language] || 0) + 1;
        return result;
    }, {});
    const languageNames = Object.keys(languageCounts);
    setMetric('modal-quality-languages', languageNames.length ? languageNames.length : 'Not available');
    const languageBreakdown = document.getElementById('modal-language-breakdown');
    if (languageBreakdown) {
        languageBreakdown.replaceChildren();
        languageNames.forEach(language => {
            const badge = document.createElement('span');
            badge.className = 'px-2 py-1 rounded border border-emerald-500/20 text-emerald-300';
            badge.textContent = `${language}: ${languageCounts[language]}`;
            languageBreakdown.appendChild(badge);
        });
    }
    const qualityStatus = document.getElementById('modal-quality-status');
    if (qualityStatus) {
        const incomplete = Number(metrics.incomplete_count || 0);
        qualityStatus.textContent = !total ? 'Not evaluated' : incomplete ? `${incomplete} incomplete` : 'Complete analysis';
        qualityStatus.className = `text-xs font-semibold ${!total ? 'text-gray-400' : incomplete ? 'text-amber-300' : 'text-emerald-300'}`;
    }
};

const populateReportLanguageFilter = (reviews) => {
    const select = document.getElementById('modal-review-language');
    if (!select) return;
    const selected = select.value;
    select.replaceChildren(new Option('All languages', 'all'));
    [...new Set(reviews.map(review => String(review.language || 'Unknown')))].sort().forEach(language => {
        select.appendChild(new Option(language, language));
    });
    select.value = [...select.options].some(option => option.value === selected) ? selected : 'all';
};

const showResultsModal = (report) => {
    const modal = document.getElementById('results-modal');
    if (!modal) return;
    const scanId = report.scan_id || report.scan_history_id || report.id || '';
    modal.dataset.scanId = scanId;
    const fullReportButton = document.getElementById('results-view-full-report');
    if (fullReportButton) fullReportButton.disabled = !loadedReportData;
    const status = document.getElementById('modal-report-status');
    if (status) status.classList.add('hidden');
    document.getElementById('modal-report-content')?.classList.remove('hidden');

    // Product Info
    document.getElementById('modal-product-platform').textContent = (report.platform || 'UNKNOWN').toUpperCase();
    document.getElementById('modal-product-title').textContent = report.product_title || 'Product';
    document.getElementById('modal-product-id').textContent = `ID: ${report.external_id || 'N/A'}`;
    const scanDate = report.scan_date ? new Date(report.scan_date) : null;
    const validScanDate = scanDate && !Number.isNaN(scanDate.getTime());
    document.getElementById('modal-scan-meta').textContent = `Scan #${scanId || 'N/A'}${validScanDate ? ` • ${scanDate.toLocaleString()}` : ''}`;

    setReportProductImage(document.getElementById('modal-product-image'), report.image_url);

    const productLink = document.getElementById('modal-product-url');
    try {
        const productUrl = new URL(report.product_url);
        const allowed = productUrl.protocol === 'http:' || productUrl.protocol === 'https:';
        productLink.classList.toggle('hidden', !allowed);
        if (allowed) productLink.href = productUrl.href;
    } catch (_) {
        productLink.classList.add('hidden');
        productLink.removeAttribute('href');
    }
    const productRating = Number(report.product_rating);
    document.getElementById('modal-product-rating').textContent = Number.isFinite(productRating) && productRating > 0
        ? `${productRating.toFixed(1)} / 5.0`
        : 'Not available';

    // Trust Score
    const genuineEvidence = Number(report.genuine_count || 0);
    const suspiciousEvidence = Number(report.fake_count || 0);
    const trustDenominator = genuineEvidence + suspiciousEvidence;
    const trustScore = trustDenominator > 0
        ? (genuineEvidence / trustDenominator) * 100
        : null;
    const trustBanner = document.getElementById('modal-trust-banner');
    document.getElementById('modal-trust-score').textContent = trustScore === null ? 'N/A' : `${trustScore.toFixed(1)}%`;

    let verdictText = '';
    let bannerClass = 'bg-emerald-500/10 border-emerald-500/30';

    if (trustScore === null) {
        verdictText = 'No evaluated reviews are available for this scan.';
        bannerClass = 'bg-gray-500/10 border-gray-500/30';
    } else if (trustScore >= 80) {
        verdictText = '✓ Reviews appear genuine and trustworthy';
        bannerClass = 'bg-emerald-500/10 border-emerald-500/30';
    } else if (trustScore >= 60) {
        verdictText = '⚠ Moderate manipulation detected - review carefully';
        bannerClass = 'bg-amber-500/10 border-amber-500/30';
    } else {
        verdictText = '✗ High risk detected - exercise strong caution';
        bannerClass = 'bg-rose-500/10 border-rose-500/30';
    }

    document.getElementById('modal-trust-verdict').textContent = verdictText;
    trustBanner.className = `p-6 rounded-xl border-2 text-center space-y-2 ${bannerClass}`;

    // Fake vs Genuine
    const reviews = loadedReportReviews || [];
    const analyzedReviews = reviews.filter(reviewHasStoredAnalysis);
    const reportMetrics = loadedReportData?.metrics || {};
    renderReportDashboardMetrics(report, reviews, reportMetrics);
    populateReportLanguageFilter(reviews);

    // Strengths & Weaknesses
    const strengthsUl = document.getElementById('modal-strengths');
    const weaknessesUl = document.getElementById('modal-weaknesses');

    strengthsUl.innerHTML = '';
    const strengthsList = Array.isArray(report.summary_strengths) ? report.summary_strengths : [];
    strengthsList.forEach(s => {
        const li = document.createElement('li');
        li.className = 'flex items-start space-x-2';
        const bullet = document.createElement('span');
        bullet.className = 'text-emerald-400 mt-1';
        bullet.textContent = '•';
        const text = document.createElement('span');
        text.textContent = String(s);
        li.append(bullet, text);
        strengthsUl.appendChild(li);
    });

    weaknessesUl.innerHTML = '';
    const weaknessesList = Array.isArray(report.summary_weaknesses) ? report.summary_weaknesses : [];
    weaknessesList.forEach(w => {
        const li = document.createElement('li');
        li.className = 'flex items-start space-x-2';
        const bullet = document.createElement('span');
        bullet.className = 'text-amber-400 mt-1';
        bullet.textContent = '•';
        const text = document.createElement('span');
        text.textContent = String(w);
        li.append(bullet, text);
        weaknessesUl.appendChild(li);
    });

    // Risk Level
    const riskLevel = report.risk_level ? String(report.risk_level) : '';
    const riskMessage = riskLevel
        ? `Stored risk level: ${riskLevel}. Review the individual model classifications below.`
        : 'No risk assessment is available for this report.';
    document.getElementById('modal-risk-message').textContent = riskMessage;
    document.getElementById('modal-genuine-summary').textContent = report.genuine_summary || 'No AI summary is available for this report.';
    document.getElementById('modal-recommendation').textContent = report.summary_recommendation || 'No recommendation is available for this report.';

    // Flagged Reviews
    const flaggedReviewsContainer = document.getElementById('modal-flagged-reviews');
    flaggedReviewsContainer.innerHTML = '';

    const flaggedReviews = analyzedReviews.filter(review => getStoredReviewStatus(review).key === 'fake');

    if (flaggedReviews.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300';
        empty.textContent = reviews.length ? 'No Potentially Fake Reviews Detected.' : 'No Reviews Available for Analysis';
        flaggedReviewsContainer.appendChild(empty);
    } else {
        flaggedReviews.forEach(review => {
            const div = document.createElement('div');
            div.className = 'p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-xs';
            const label = document.createElement('div');
            label.className = 'font-semibold mb-1';
            label.textContent = 'Potentially Fake';
            const text = document.createElement('p');
            text.className = 'text-gray-300 whitespace-pre-wrap';
            text.textContent = review.review_text || 'No review text stored.';
            div.append(label, text);
            flaggedReviewsContainer.appendChild(div);
        });
    }

    const filter = document.getElementById('modal-review-filter');
    const search = document.getElementById('modal-review-search');
    const sort = document.getElementById('modal-review-sort');
    if (filter) filter.value = 'all';
    if (search) search.value = '';
    if (sort) sort.value = 'sequence';
    reportReviewPage = 1;
    closeModalReviewDetail();
    renderAnalyzedReviews();

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Initialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
};

const loadReportData = async (scanId) => {
    try {
        console.log("[EchoTrace] Loading report for scan ID:", scanId);
        // Use & since base already has ?route=
        const res = await EchoTraceAPI.get(`scan/report&scan_id=${scanId}`);
        console.log("[EchoTrace] Report response:", res);

        if (res && res.success && res.report) {
            loadedReportReviews = res.reviews || [];
            loadedReportData = res;
            renderReportView(res);
        } else {
            console.warn("[EchoTrace] Report not found for scan:", scanId, res ? res.error : 'Unknown error');
            const titleEl = document.getElementById('report-title');
            if (titleEl) titleEl.textContent = "Report Not Found";
            const metaEl = document.getElementById('report-meta');
            if (metaEl) metaEl.textContent = (res && res.error) ? res.error : "Audit data not found for scan ID " + scanId;
        }
    } catch (e) {
        console.error("Failed to load report", e);
        const titleEl = document.getElementById('report-title');
        if (titleEl) titleEl.textContent = "Error Loading Report";
        const metaEl = document.getElementById('report-meta');
        if (metaEl) metaEl.textContent = e.message || "Failed to communicate with report API.";
    }
};

const renderReportView = (data) => {
    try {
        const report = data.report;
        loadedReportReviews = data.reviews || [];
        // Cache full report data for export
        loadedReportData = { ...report, reviews: data.reviews, metrics: data.metrics || null };

        // Helper for safe element text/attr setting
        const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        const setAttr = (id, attr, val) => { const el = document.getElementById(id); if (el) el[attr] = val; };

        // Set texts
        setText('report-title', report.product_title);
        setText('report-meta', `${(report.platform || '').toUpperCase()} | ID: ${report.external_id || ''}`);

        setText('report-prod-platform', report.platform);
        setText('report-prod-title', report.product_title);
        setText('report-prod-rating', `${parseFloat(report.product_rating || 0).toFixed(1)} / 5.0`);
        setReportProductImage(document.getElementById('report-prod-img'), report.image_url);
        setAttr('report-prod-url', 'href', report.product_url || '#');

        // Overall Quality Display
        const quality = report.overall_quality || 'Good';
        const qualityEl = document.getElementById('report-quality');
        if (qualityEl) {
            qualityEl.textContent = quality;
            qualityEl.className = `px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${quality === 'Excellent' ? 'bg-emerald-500/10 text-emerald-400' :
                    quality === 'Good' ? 'bg-sky-500/10 text-sky-400' :
                        quality === 'Average' ? 'bg-amber-500/10 text-amber-400' :
                            'bg-rose-500/10 text-rose-400'
                }`;
        }

        // Summary of Genuine Reviews Display
        setText('report-genuine-summary', report.genuine_summary || 'No summary available.');

        const reportGenuine = Number(report.genuine_count || 0);
        const reportSuspicious = Number(report.fake_count || 0);
        const reportTrustDenominator = reportGenuine + reportSuspicious;
        const trustScore = reportTrustDenominator > 0
            ? (reportGenuine / reportTrustDenominator) * 100
            : null;
        const scorePctEl = document.getElementById('report-trust-score-pct');
        if (scorePctEl) scorePctEl.textContent = trustScore === null ? 'N/A' : `${trustScore.toFixed(1)}%`;

        const riskLevel = trustScore === null ? 'NOT EVALUATED' : (report.risk_level || 'Low Risk').toUpperCase();
        const riskEl = document.getElementById('report-risk-level');
        let verdictText = '';
        if (riskEl) {
            riskEl.textContent = riskLevel;
            if (trustScore === null) {
                riskEl.className = "text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1";
                verdictText = "Not evaluated: uncertain reviews are excluded from the trust-score denominator.";
            } else if (riskLevel.includes('LOW')) {
                riskEl.className = "text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-1";
                verdictText = "The reviews profile looks highly genuine. The rating represents real sentiment.";
            } else if (riskLevel.includes('MEDIUM') || riskLevel.includes('MODERATE')) {
                riskEl.className = "text-[10px] text-amber-400 font-bold uppercase tracking-wider mt-1";
                verdictText = "Moderate suspicious profiles detected (duplications/spam phrasing). Evaluate reviews carefully.";
            } else {
                riskEl.className = "text-[10px] text-rose-400 font-bold uppercase tracking-wider mt-1";
                verdictText = "High quantity of duplicate, toxic, or AI-generated reviews detected. Exercise strong caution.";
            }
        }
        setText('report-verdict', verdictText);

        const reportMetrics = data.metrics || {};
        const reportAnalyzed = Number(reportMetrics.analyzed_count ?? loadedReportReviews.filter(reviewHasStoredAnalysis).length);
        setText('report-summary-total', reportAnalyzed);
        setText('report-summary-confirmed', reportMetrics.confirmed_review_count ?? report.scan_metadata?.confirmed_review_count ?? reportAnalyzed);
        setText('report-summary-genuine', Number(reportMetrics.likely_genuine_count ?? report.genuine_count ?? 0));
        setText('report-summary-fake', Number(reportMetrics.potentially_fake_count ?? report.fake_count ?? 0));
        setText('report-summary-uncertain', Number(reportMetrics.uncertain_count ?? report.uncertain_count ?? 0));
        const reportCoverage = Number(reportMetrics.analysis_coverage_percent);
        setText('report-summary-coverage', Number.isFinite(reportCoverage) ? `${reportCoverage.toFixed(1)}%` : 'Not available');
        setText('report-summary-source', formatReportSource(report.review_source));
        const screenshotMetadata = report.scan_metadata || {};
        setText('report-trust-label', report.review_source === 'screenshot_ocr' ? 'Review-Sample Trust Score' : 'Product Trust Score');
        setText('report-summary-screenshots', screenshotMetadata.uploaded_screenshot_count != null ? screenshotMetadata.uploaded_screenshot_count : 'Not available');
        setText('report-summary-candidates', screenshotMetadata.ocr_candidate_count != null ? screenshotMetadata.ocr_candidate_count : 'Not available');
        setText('report-summary-duration', Number.isFinite(Number(report.duration_ms)) ? `${Number(report.duration_ms).toLocaleString()} ms` : 'Not recorded');
        const reportTimestamp = report.generated_at || report.scan_date;
        setText('report-summary-timestamp', reportTimestamp ? new Date(reportTimestamp).toLocaleString() : 'Not recorded');
        const ocrDetails = document.getElementById('modal-ocr-details');
        if (ocrDetails) {
            const warnings = Array.isArray(reportMetrics.ocr_warnings) ? reportMetrics.ocr_warnings : [];
            const limitations = Array.isArray(reportMetrics.limitations) ? reportMetrics.limitations : [];
            const lines = [...warnings.map(w => `OCR warning: ${w}`), ...limitations];
            ocrDetails.textContent = lines.join('\n');
            ocrDetails.classList.toggle('hidden', !lines.length);
            const reportOcrDetails = document.getElementById('report-ocr-details');
            if (reportOcrDetails) {
                reportOcrDetails.textContent = lines.join('\n');
                reportOcrDetails.classList.toggle('hidden', !lines.length);
            }
        }

        // Render Doughnut Chart
        const fakeCount = parseInt(report.fake_count || 0);
        const genuineCount = parseInt(report.genuine_count || 0);
        EchoTraceCharts.renderReportCharts(fakeCount, genuineCount);

        // Render Strengths/Weaknesses safely
        const strengthsUl = document.getElementById('report-strengths');
        if (strengthsUl) {
            strengthsUl.innerHTML = '';
            const strengthsList = Array.isArray(report.summary_strengths) ? report.summary_strengths : [];
            strengthsList.forEach(s => {
                const li = document.createElement('li');
                li.textContent = s;
                strengthsUl.appendChild(li);
            });
        }

        const weaknessesUl = document.getElementById('report-weaknesses');
        if (weaknessesUl) {
            weaknessesUl.innerHTML = '';
            const weaknessesList = Array.isArray(report.summary_weaknesses) ? report.summary_weaknesses : [];
            weaknessesList.forEach(w => {
                const li = document.createElement('li');
                li.textContent = w;
                weaknessesUl.appendChild(li);
            });
        }

        // Render RAG Policy Grounding & Executive Synthesis Card
        const ragSynth = data.rag_synthesis || report.rag_synthesis || null;
        const ragSummaryTextEl = document.getElementById('report-rag-summary-text');
        const ragBadgeEl = document.getElementById('report-rag-risk-badge');
        const ragCitationsEl = document.getElementById('report-rag-citations');

        if (ragSummaryTextEl) {
            if (ragSynth && ragSynth.rag_executive_summary) {
                ragSummaryTextEl.textContent = ragSynth.rag_executive_summary;

                if (ragBadgeEl) {
                    const statusText = ragSynth.status || (trustScore >= 80 ? 'VERIFIED AUTHENTIC' : 'HIGH MANIPULATION WARNING');
                    ragBadgeEl.textContent = statusText;
                    if (trustScore >= 80) {
                        ragBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
                    } else if (trustScore >= 60) {
                        ragBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30';
                    } else {
                        ragBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30';
                    }
                }

                if (ragCitationsEl) {
                    ragCitationsEl.innerHTML = '<span class="text-gray-400 text-xs font-semibold mr-2">Policy Citations:</span>';
                    const citations = ragSynth.policy_grounding_citations || [];
                    if (citations.length > 0) {
                        citations.forEach(c => {
                            const tag = document.createElement('span');
                            tag.className = 'bg-emerald-500/10 text-emerald-300 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-emerald-500/20 flex items-center space-x-1';
                            const icon = document.createElement('i');
                            icon.dataset.lucide = 'book-open';
                            icon.className = 'w-3 h-3 text-emerald-400';
                            const title = document.createElement('span');
                            title.textContent = String(c?.title || 'Untitled source');
                            tag.append(icon, title);
                            ragCitationsEl.appendChild(tag);
                        });
                    } else {
                        ragCitationsEl.innerHTML += '<span class="text-gray-500 text-xs italic">FTC 16 CFR Part 255 & E-Commerce Guidelines</span>';
                    }
                }
            } else {
                ragSummaryTextEl.textContent = `EchoTrace RAG Policy Audit: Analysis for '${report.product_title}' indicates a Trust Score of ${trustScore.toFixed(1)}%. Audit results cross-referenced against FTC guidelines and platform conduct rules.`;
                if (ragBadgeEl) ragBadgeEl.textContent = trustScore >= 80 ? 'LOW RISK AUDIT' : 'POLICY CAUTION';
            }
        }

        // Populate reviews list
        populateReportReviews(loadedReportReviews);
    } catch (err) {
        console.error('Failed to render report view:', err);
    }
};

const populateReportReviews = (reviews) => {
    const listContainer = document.getElementById('report-reviews-list');
    const tableBody = document.getElementById('report-reviews-table-body');

    listContainer.innerHTML = '';
    if (tableBody) tableBody.innerHTML = '';

    if (reviews.length === 0) {
        const emptyMsg = `<p class="text-xs text-gray-500 text-center py-8">No matching reviews found.</p>`;
        listContainer.innerHTML = emptyMsg;
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-gray-500">No matching reviews found.</td></tr>`;
        return;
    }

    // Helper function to generate star rating HTML
    const getStarHtml = (rating) => {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            stars += `<i data-lucide="star" class="w-3 h-3 inline ${i <= rating ? 'text-yellow-500 fill-current' : 'text-gray-600'}"></i>`;
        }
        return stars;
    };

    // Helper function to get classification color
    const getClassificationColor = (isFake) => {
        return isFake ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400";
    };

    // Helper function to get risk color
    const getRiskColor = (riskLevel) => {
        if (riskLevel.includes('High')) return 'text-rose-400';
        if (riskLevel.includes('Medium')) return 'text-amber-400';
        return 'text-emerald-400';
    };

    // Helper function to get grammar color
    const getGrammarColor = (grammarVal) => {
        if (grammarVal < 50) return 'text-rose-400';
        if (grammarVal < 80) return 'text-amber-400';
        return 'text-emerald-400';
    };

    // Populate both desktop table and mobile cards
    reviews.forEach(r => {
        const isFake = parseInt(r.is_fake) === 1;
        const dateStr = r.review_date ? r.review_date : 'Unknown';
        const classification = r.classification || (isFake ? "Suspicious" : "Genuine");
        const reviewRiskLevel = r.risk_level || (isFake ? "Medium Risk" : "Low Risk");
        const grammarVal = parseFloat(r.grammar_score || 100);
        const confidence = parseFloat(r.confidence_score || 0).toFixed(1);
        const reviewText = r.review_text ? r.review_text.substring(0, 60) + '...' : 'N/A';
        const safeAuthor = escapeHtml(r.author || 'Anonymous');
        const safeDate = escapeHtml(dateStr);
        const safeFullText = escapeHtml(r.review_text || 'N/A');
        const safeReviewText = escapeHtml(reviewText);
        const safeClassification = escapeHtml(classification);
        const safeRiskLevel = escapeHtml(reviewRiskLevel);
        const safeReviewId = Number.isInteger(Number(r.id)) ? Number(r.id) : 0;

        // Desktop Table Row
        if (tableBody) {
            const tr = document.createElement('tr');
            tr.className = `hover:bg-glassBorder/10 transition-colors ${isFake ? 'bg-rose-500/5' : ''}`;
            tr.innerHTML = `
                <td class="p-4 font-medium text-gray-200">${safeAuthor}</td>
                <td class="p-4 text-gray-400 whitespace-nowrap">${safeDate}</td>
                <td class="p-4">
                    <div class="flex items-center space-x-0.5">
                        ${getStarHtml(r.rating)}
                    </div>
                </td>
                <td class="p-4 text-gray-300 max-w-xs truncate" title="${safeFullText}">${safeReviewText}</td>
                <td class="p-4">
                    <span class="px-2 py-1 rounded text-[9px] font-bold ${getClassificationColor(isFake)}">${safeClassification}</span>
                </td>
                <td class="p-4">
                    <span class="text-xs font-bold ${getRiskColor(reviewRiskLevel)}">${safeRiskLevel}</span>
                </td>
                <td class="p-4">
                    <span class="text-xs font-bold ${isFake ? 'text-rose-400' : 'text-emerald-400'}">${confidence}%</span>
                </td>
                <td class="p-4">
                    <span class="text-xs font-bold ${getGrammarColor(grammarVal)}">${grammarVal.toFixed(0)}%</span>
                </td>
            `;
            tableBody.appendChild(tr);
        }

        // Mobile Card
        const card = document.createElement('div');
        card.className = `p-4 rounded-xl border text-xs flex flex-col justify-between space-y-3 transition-all ${isFake
                ? 'bg-rose-500/10 border-rose-500/25'
                : 'bg-glassBorder/10 border-glassBorder hover:border-emeraldGreen/30'
            }`;

        // Reasons badge if fake
        let reasonBadges = '';
        if (isFake) {
            let reasons = [];
            try {
                if (typeof r.fake_reasons === 'string') {
                    reasons = JSON.parse(r.fake_reasons || '[]');
                } else if (Array.isArray(r.fake_reasons)) {
                    reasons = r.fake_reasons;
                }
            } catch (err) {
                reasons = r.fake_reasons ? [String(r.fake_reasons)] : [];
            }
            if (!Array.isArray(reasons)) reasons = [String(reasons)];
            reasons.slice(0, 2).forEach(reason => {
                reasonBadges += `<span class="bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded text-[9px] font-semibold">${escapeHtml(reason)}</span>`;
            });
        }

        card.innerHTML = `
            <div class="space-y-2">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="font-bold text-gray-200 block">${safeAuthor}</span>
                        <span class="text-gray-500 text-[10px]">${safeDate}</span>
                    </div>
                    <div class="flex items-center space-x-0.5">
                        ${getStarHtml(r.rating)}
                    </div>
                </div>
                <p class="text-gray-300 italic leading-relaxed line-clamp-2">"${safeFullText}"</p>
            </div>
            
            <div class="flex flex-wrap gap-2 items-center">
                <span class="px-2 py-1 rounded text-[9px] font-bold ${getClassificationColor(isFake)}">${safeClassification}</span>
                <span class="text-[9px] font-bold ${getRiskColor(reviewRiskLevel)}">${safeRiskLevel}</span>
                <span class="text-[9px] font-bold ${isFake ? 'text-rose-400' : 'text-emerald-400'}">Conf: ${confidence}%</span>
                <span class="text-[9px] font-bold ${getGrammarColor(grammarVal)}">Grammar: ${grammarVal.toFixed(0)}%</span>
                ${reasonBadges}
            </div>

            ${r.rag_explanation && r.rag_explanation.rag_explanation ? `
                <div class="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[10px] text-emerald-300/90 leading-relaxed flex items-start space-x-2">
                    <i data-lucide="shield-alert" class="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5"></i>
                    <span><b>RAG:</b> ${escapeHtml(r.rag_explanation.rag_explanation.substring(0, 80))}...</span>
                </div>
            ` : ''}

            <div class="flex items-center justify-between pt-2 border-t border-glassBorder/40">
                <button onclick="reportReviewCorrection(${safeReviewId}, '${isFake ? 'genuine' : 'fake'}')" class="text-emerald-400 hover:text-emerald-300 font-semibold hover:underline text-[10px]">
                    Report Correction
                </button>
            </div>
        `;

        listContainer.appendChild(card);
    });

    lucide.createIcons();
};

const filterReportReviews = () => {
    const filter = document.getElementById('review-filter-label').value;
    let filtered = loadedReportReviews;

    if (filter === 'fake') {
        filtered = loadedReportReviews.filter(r => parseInt(r.is_fake) === 1);
    } else if (filter === 'genuine') {
        filtered = loadedReportReviews.filter(r => parseInt(r.is_fake) === 0);
    }

    populateReportReviews(filtered);
};

const reportReviewCorrection = async (reviewId, correctionLabel) => {
    const comment = prompt(`Explain why this review is ${correctionLabel}:`);
    if (comment === null) return; // user cancelled

    try {
        const res = await EchoTraceAPI.post('review/report', {
            review_id: reviewId,
            reported_label: correctionLabel,
            comments: comment
        });

        if (res.success) {
            alert(res.message);
        } else {
            alert(res.error);
        }
    } catch (e) {
        alert(e.message);
    }
};

const exportReport = async (format) => {
    if (!loadedReportData) {
        alert('No report data loaded to export.');
        return;
    }
    try {
        if (format === 'pdf') {
            const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
            })[character]);
            // Open a new window with minimal styling for printing
            const printWindow = window.open('', '_blank');
            const doc = printWindow.document;
            doc.write('<html><head><title>Report Export</title>');
            // Basic styles for PDF
            doc.write('<style>body{font-family:Arial,sans-serif;padding:20px;}h1{font-size:24px;margin-bottom:10px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}</style>');
            doc.write('</head><body>');
            doc.write(`<h1>${escapeHtml(loadedReportData.product_title)}</h1>`);
            doc.write(`<p>Platform: ${escapeHtml(loadedReportData.platform)}</p>`);
            const exportGenuine = Number(loadedReportData.genuine_count || 0);
            const exportSuspicious = Number(loadedReportData.fake_count || 0);
            const exportDenominator = exportGenuine + exportSuspicious;
            const exportTrust = exportDenominator > 0 ? `${((exportGenuine / exportDenominator) * 100).toFixed(1)}%` : 'N/A';
            doc.write(`<p>Trust Score: ${escapeHtml(exportTrust)} (submitted review sample)</p>`);
            doc.write(`<p>Risk Level: ${escapeHtml(loadedReportData.risk_level)}</p>`);
            doc.write('<h2>Reviews</h2>');
            doc.write('<table><thead><tr><th>No.</th><th>Rating</th><th>Review Text</th><th>Classification</th><th>Confidence</th></tr></thead><tbody>');
            loadedReportData.reviews.forEach((r, index) => {
                const classification = reviewHasStoredAnalysis(r) ? getStoredReviewStatus(r).label : 'Analysis Incomplete';
                const score = getValidFakeProbability(r);
                doc.write(`<tr><td>${index + 1}</td><td>${escapeHtml(r.rating ?? 'Not available')}</td><td>${escapeHtml(r.review_text)}</td><td>${escapeHtml(classification)}</td><td>${score === null ? 'Not provided' : `${score.toFixed(1)}% fake probability`}</td></tr>`);
            });
            doc.write('</tbody></table>');
            doc.write('</body></html>');
            doc.close();
            printWindow.focus();
            printWindow.print();
        } else if (format === 'excel') {
            // Generate CSV content
            const headers = ['No.', 'Rating', 'Review Text', 'Classification', 'Fake Probability', 'Analysis Details', 'Sentiment', 'Intent'];
            const rows = loadedReportData.reviews.map((r, index) => {
                const classification = reviewHasStoredAnalysis(r) ? getStoredReviewStatus(r).label : 'Analysis Incomplete';
                const score = getValidFakeProbability(r);
                return [index + 1, r.rating ?? '', String(r.review_text || '').replace(/\n/g, ' '), classification, score === null ? '' : score, getStoredAnalysisDetails(r).join(' | '), r.sentiment || '', r.intent || ''];
            });
            const csvContent = [headers, ...rows].map(e => e.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `${String(loadedReportData.product_title || 'EchoTrace').replace(/\s+/g, '_')}_report.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            alert('Unsupported export format.');
        }
    } catch (e) {
        console.error('Export error:', e);
        alert('Failed to export report.');
    }
};

// --- NOTIFICATION CENTER ---
let notificationItems = [];
let notificationPollingTimer = null;
let notificationRequestActive = false;
let clearingNotifications = false;

const escapeNotificationText = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]);
const notificationIcon = (type) => type === 'fake_reviews_detected' ? 'shield-alert' : type === 'scan_completed' ? 'circle-check' : 'bell';

const updateNotificationBadge = (count) => {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.toggle('hidden', count < 1);
    if (count > 0) { badge.classList.add('animate-pulse'); setTimeout(() => badge.classList.remove('animate-pulse'), 800); }
};

const renderNotifications = () => {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!notificationItems.length) { list.innerHTML = '<p class="text-xs text-gray-500 text-center py-5">No notifications yet</p>'; return; }
    list.innerHTML = notificationItems.map(item => {
        const unread = Number(item.is_read) === 0;
        const action = item.scan_id ? `<button type="button" onclick="openNotificationReport(${Number(item.id)}, '${String(item.scan_id)}')" class="mt-2 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300">View Full Report</button>` : '';
        return `<article class="relative rounded-lg border ${unread ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-glassBorder bg-white/[.02]'} p-3 transition-colors hover:bg-white/[.05]">
            <button type="button" onclick="deleteNotification(${Number(item.id)})" aria-label="Delete notification" class="absolute right-2 top-2 text-gray-500 hover:text-rose-300">×</button>
            <button type="button" onclick="readNotification(${Number(item.id)})" class="w-full pr-5 text-left">
                <div class="flex gap-2"><i data-lucide="${notificationIcon(item.type)}" class="mt-0.5 w-4 h-4 ${unread ? 'text-emerald-400' : 'text-gray-500'}"></i><div><p class="text-xs font-semibold text-gray-100">${escapeNotificationText(item.title || 'EchoTrace update')}</p><p class="mt-1 text-[11px] leading-4 text-gray-400">${escapeNotificationText(item.message)}</p><p class="mt-1 text-[10px] text-gray-500">${new Date(item.created_at).toLocaleString()}</p></div></div>
            </button>${action}</article>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
};

const loadNotifications = async (forceList = false) => {
    if (!EchoTraceAuth.isAuthenticated() || notificationRequestActive) return;
    const dropdownOpen = !document.getElementById('notif-dropdown')?.classList.contains('hidden');
    if (!forceList && !dropdownOpen) {
        try { const data = await EchoTraceAPI.get('notifications/unread-count'); if (data.success) updateNotificationBadge(data.unread_count || 0); } catch (_) { }
        return;
    }
    notificationRequestActive = true;
    const list = document.getElementById('notif-list'); if (list && !notificationItems.length) list.innerHTML = '<p class="text-xs text-gray-500 text-center py-5">Loading notifications…</p>';
    try { const data = await EchoTraceAPI.get('notifications&limit=20'); if (!data.success) throw new Error(data.error); notificationItems = data.notifications || []; updateNotificationBadge(data.unread_count || 0); renderNotifications(); }
    catch (error) { if (list) list.innerHTML = `<p class="text-xs text-rose-300 text-center py-5">${escapeNotificationText(error.message || 'Unable to load notifications.')}</p>`; }
    finally { notificationRequestActive = false; }
};

const toggleNotifications = () => { const dropdown = document.getElementById('notif-dropdown'); dropdown.classList.toggle('hidden'); if (!dropdown.classList.contains('hidden')) loadNotifications(true); };
const readNotification = async (id) => { const item = notificationItems.find(n => Number(n.id) === Number(id)); if (!item || Number(item.is_read)) return; try { await EchoTraceAPI.patch('notifications/read', { id }); item.is_read = 1; item.read_at = new Date().toISOString(); updateNotificationBadge(notificationItems.filter(n => Number(n.is_read) === 0).length); renderNotifications(); } catch (error) { showNotification(error.message || 'Could not mark notification as read.', 'error'); } };
const openNotificationReport = async (id, scanId) => { await readNotification(id); openDashboardFullReport(scanId); };
const clearNotifs = async () => { try { await EchoTraceAPI.patch('notifications/read-all', {}); notificationItems.forEach(n => n.is_read = 1); updateNotificationBadge(0); renderNotifications(); showNotification('Notifications marked as read.', 'success'); } catch (error) { showNotification(error.message || 'Could not update notifications.', 'error'); } };
const deleteNotification = async (id) => { try { await EchoTraceAPI.delete('notifications/delete', { id }); notificationItems = notificationItems.filter(n => Number(n.id) !== Number(id)); updateNotificationBadge(notificationItems.filter(n => Number(n.is_read) === 0).length); renderNotifications(); } catch (error) { showNotification(error.message || 'Could not delete notification.', 'error'); } };
const clearAllNotifs = () => { document.getElementById('notifications-clear-modal')?.classList.replace('hidden', 'flex'); if (window.lucide) lucide.createIcons(); };
const closeClearNotificationsModal = () => { if (!clearingNotifications) document.getElementById('notifications-clear-modal')?.classList.replace('flex', 'hidden'); };
const confirmClearAllNotifs = async () => { if (clearingNotifications) return; clearingNotifications = true; const confirm = document.getElementById('notifications-clear-confirm'); const status = document.getElementById('notifications-clear-status'); confirm.disabled = true; confirm.textContent = 'Clearing…'; status.className = 'mt-3 text-sm text-sky-300'; status.textContent = 'Deleting notifications…'; try { const data = await EchoTraceAPI.delete('notifications/clear'); notificationItems = []; updateNotificationBadge(0); renderNotifications(); clearingNotifications = false; closeClearNotificationsModal(); showNotification(`${data.deleted_count || 0} notifications cleared.`, 'success'); } catch (error) { status.className = 'mt-3 text-sm text-rose-300'; status.textContent = error.message || 'Unable to clear notifications.'; } finally { clearingNotifications = false; confirm.disabled = false; confirm.textContent = 'Clear notifications'; } };

const startNotificationPolling = () => {
    if (notificationPollingTimer) return;
    loadNotifications(false);
    notificationPollingTimer = setInterval(() => { if (!document.hidden) loadNotifications(false); }, 30000);
};

// --- ADMINISTRATOR PANEL ACTIONS ---

let activeAdminTab = 'dashboard';
let adminAnalyticsCharts = {};
const switchAdminTab = (tabName) => {
    // Hide all tab content panels
    document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.add('hidden'));

    // Show the requested tab content (guard against null)
    const contentEl = document.getElementById(`admin-tab-${tabName}`);
    if (contentEl) {
        contentEl.classList.remove('hidden');
    } else {
        console.warn(`[switchAdminTab] No content div found for tab: ${tabName}`);
    }

    // Reset all tab button styles
    document.querySelectorAll('[id$="-btn"][id^="tab-"]').forEach(btn => {
        btn.className = "py-2 border-b-2 border-transparent text-gray-400 hover:text-white transition-all";
    });

    // Activate the clicked tab button (guard against null)
    const btnEl = document.getElementById(`tab-${tabName}-btn`);
    if (btnEl) {
        btnEl.className = "py-2 border-b-2 border-emeraldGreen text-white font-semibold transition-all";
    }

    // Load tab-specific data
    // (maintenance tab removed)

    activeAdminTab = tabName;
};

const loadAdminDashboard = async () => {
    try {
        const res = await EchoTraceAPI.get('admin/dashboard');
        if (res && res.success) {
            const s = res.dashboard || {};
            const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setEl('admin-stat-users', s.total_users ?? '--');
            setEl('admin-stat-fake-analytics', s.fake_reviews ?? '--');
            setEl('admin-stat-user-growth', s.active_users ?? '--');
            setEl('admin-stat-product-analytics', s.total_products ?? '--');
            renderAdminModelEvaluation(res.model_evaluation);
        }
    } catch (e) {
        console.warn('[loadAdminDashboard] Could not load dashboard stats:', e.message);
        // Non-fatal — UI shows placeholders
    }
};

const renderAdminModelEvaluation = (evaluation) => {
    const accuracyEl = document.getElementById('admin-stat-ai-accuracy');
    const performanceEl = document.getElementById('admin-model-performance');
    const accuracy = Number(evaluation?.test_accuracy);
    const isEvaluated = evaluation?.status === 'evaluated'
        && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100;

    if (accuracyEl) accuracyEl.textContent = isEvaluated ? `${accuracy.toFixed(2)}%` : 'Not evaluated';
    if (!performanceEl) return;

    performanceEl.replaceChildren();
    if (!isEvaluated) {
        performanceEl.textContent = 'Not evaluated. No valid held-out test metrics are saved for the current model.';
        return;
    }

    const evaluatedDate = evaluation.evaluated_at ? new Date(evaluation.evaluated_at) : null;
    const evaluatedLabel = evaluatedDate && !Number.isNaN(evaluatedDate.getTime())
        ? evaluatedDate.toLocaleString() : 'Unknown';
    const scope = evaluation.dataset_scope === 'synthetic_labeled_data'
        ? 'Labeled synthetic held-out data' : 'Labeled held-out data';
    const validation = evaluation.validation_accuracy == null
        ? `${evaluation.validation_size ?? 'Unknown'} samples; used for threshold selection (accuracy not stored for this run)`
        : `${Number(evaluation.validation_accuracy).toFixed(2)}% on ${evaluation.validation_size ?? 'unknown'} tuning samples`;

    const rows = [
        ['Held-out test accuracy', `${accuracy.toFixed(2)}%`],
        ['Model version', evaluation.model_version || 'Unknown'],
        ['Evaluated', evaluatedLabel],
        ['Test set', `${evaluation.test_size ?? 'Unknown'} samples · ${scope}`],
        ['Validation', validation],
        ['Split protection', evaluation.split_strategy === 'group_aware' ? 'Group-aware; duplicate families kept together' : (evaluation.split_strategy || 'Unknown')]
    ];
    const list = document.createElement('dl');
    list.className = 'space-y-2';
    rows.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'flex flex-wrap justify-between gap-2 border-b border-white/5 pb-2';
        const term = document.createElement('dt');
        term.className = 'text-gray-500';
        term.textContent = label;
        const description = document.createElement('dd');
        description.className = 'text-gray-200 text-right';
        description.textContent = value;
        row.append(term, description);
        list.appendChild(row);
    });
    performanceEl.appendChild(list);
};

const loadAdminAnalytics = async () => {
    const status = document.getElementById('admin-analytics-status');
    const days = document.getElementById('admin-analytics-range')?.value || '30';
    if (status) status.textContent = 'Loading actual scan analytics…';
    try {
        const data = await EchoTraceAPI.get(`admin/analytics&days=${encodeURIComponent(days)}`);
        if (!data.success) throw new Error(data.error || 'Analytics could not be loaded.');
        const s = data.summary || {};
        const setEl = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
        setEl('admin-stat-users', s.total_users ?? '—');
        setEl('admin-stat-fake-analytics', `${s.fake_reviews ?? 0}${s.fake_rate == null ? '' : ` (${s.fake_rate}%)`}`);
        setEl('admin-stat-user-growth', s.new_users ?? 0);
        setEl('admin-stat-product-analytics', (data.products || []).length);
        renderAdminModelEvaluation(data.model_evaluation);
        if (status) status.textContent = `${data.range.start} to ${data.range.end} · ${s.scans || 0} completed scans · ${s.analyzed_reviews || 0} analyzed reviews`;
        const render = (key, id, config) => { if (adminAnalyticsCharts[key]) adminAnalyticsCharts[key].destroy(); const canvas = document.getElementById(id); if (canvas && window.Chart) adminAnalyticsCharts[key] = new Chart(canvas, config); };
        const trend = data.trend || [];
        const darkScales = { x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,.05)' } }, y: { beginAtZero: true, ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,.05)' } } };
        render('trend', 'admin-analytics-trend', { type: 'line', data: { labels: trend.map(x => new Date(x.date).toLocaleDateString()), datasets: [{ label: 'Analyzed', data: trend.map(x => Number(x.fake_reviews) + Number(x.genuine_reviews)), borderColor: '#38bdf8', tension: .35 }, { label: 'Potentially fake', data: trend.map(x => x.fake_reviews), borderColor: '#fb7185', tension: .35 }, { label: 'Likely genuine', data: trend.map(x => x.genuine_reviews), borderColor: '#34d399', tension: .35 }] }, options: { responsive: true, maintainAspectRatio: false, scales: darkScales, plugins: { legend: { labels: { color: '#cbd5e1' } } } } });
        render('distribution', 'admin-analytics-distribution', { type: 'doughnut', data: { labels: (data.distribution || []).map(x => x.label), datasets: [{ data: (data.distribution || []).map(x => x.value), backgroundColor: ['#fb7185', '#34d399'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1' } } }, cutout: '65%' } });
        render('products', 'admin-analytics-products', { type: 'bar', data: { labels: (data.products || []).map(x => String(x.title || 'Product').slice(0, 24)), datasets: [{ label: 'Potentially fake predictions', data: (data.products || []).map(x => x.fake_reviews), backgroundColor: '#fb7185', borderRadius: 6 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: darkScales, plugins: { legend: { display: false } } } });
    } catch (error) { if (status) status.textContent = error.message || 'Unable to load analytics.'; }
};

const loadAdminData = async () => {
    try {
        // Load Dashboard Stats first
        await loadAdminDashboard();
        await loadAdminAnalytics();

        // 1. Fetch Scan History (Recent Audits)
        const historyRes = await EchoTraceAPI.get('scan/history');
        if (historyRes.success) {
            populateAdminHistory(historyRes.history || []);
        }

        // 2. Fetch Users
        const usersRes = await EchoTraceAPI.get('admin/users');
        if (usersRes.success) {
            populateAdminUsers(usersRes.users);
        }

        // 3. Fetch Feedback (Community Reports)
        const feedbackRes = await EchoTraceAPI.get('admin/feedback');
        if (feedbackRes.success) {
            populateAdminFeedback(feedbackRes.reports);
        }

        // 4. Fetch Reports
        const reportsRes = await EchoTraceAPI.get('admin/reports');
        if (reportsRes.success) {
            populateAdminReports(reportsRes.reports);
        }

        // 5. Fetch Products
        const productsRes = await EchoTraceAPI.get('admin/products');
        if (productsRes.success) {
            populateAdminProducts(productsRes.products);
        }

        // 6. Fetch Logs
        const logsRes = await EchoTraceAPI.get('admin/logs');
        if (logsRes.success) {
            populateAdminLogs(logsRes.ai_logs, logsRes.login_logs);
        }
    } catch (e) {
        console.error("Admin data loading failure:", e);
    }
};

const populateAdminHistory = (scans) => {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!scans || scans.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-10 text-center">
                    <div class="flex flex-col items-center gap-3 text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                        <p class="text-sm font-medium">No audit history yet</p>
                        <p class="text-xs text-gray-600">Run your first scan to see results here</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    scans.forEach((s) => {
        const scanId = Number(s.id);
        if (!Number.isInteger(scanId) || scanId < 1) return;
        const safePlatform = escapeHtml(s.platform || 'unknown');
        const safeProductTitle = escapeHtml(s.product_title || 'Untitled product');
        const tr = document.createElement('tr');
        tr.className = "hover:bg-glassBorder/10 transition-colors";

        const platformBadge = `<span class="px-2.5 py-1 text-[10px] font-bold rounded-lg border uppercase ${s.platform === 'amazon' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                s.platform === 'shopee' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
                    'bg-sky-500/10 border-sky-500/20 text-sky-400'
            }">${safePlatform}</span>`;

        const trustPct = parseFloat(s.trust_score || 0);
        const trustClass = trustPct >= 80 ? 'text-emerald-400' : (trustPct >= 50 ? 'text-amber-400' : 'text-rose-400');

        const date = new Date(s.scan_date).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        tr.innerHTML = `
            <td class="p-4">${platformBadge}</td>
            <td class="p-4 font-semibold text-white max-w-xs truncate">${safeProductTitle}</td>
            <td class="p-4 font-bold ${trustClass}">${trustPct.toFixed(2)}%</td>
            <td class="p-4 text-rose-400">${s.fake_count || 0} / ${parseInt(s.fake_count || 0) + parseInt(s.genuine_count || 0)}</td>
            <td class="p-4 text-gray-400 text-xs">${date}</td>
            <td class="p-4 text-center">
                <div class="flex items-center justify-center gap-2">
                    <button onclick="openDashboardFullReport('${scanId}')" class="text-xs bg-emeraldGreen/10 border border-emeraldGreen/30 text-emeraldGreen px-3 py-1 rounded-lg hover:bg-emeraldGreen hover:text-white transition-all">View Report</button>
                    <button type="button" onclick="deleteScan('${scanId}', this)" data-delete-scan-id="${scanId}" class="text-xs bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3 py-1 rounded-lg hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-wait">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();
};

const populateAdminUsers = (users) => {
    const tbody = document.getElementById('admin-users-table-body');
    tbody.innerHTML = '';

    users.forEach(u => {
        const userId = Number(u.id);
        if (!Number.isInteger(userId) || userId < 1) return;
        const userStatus = u.status === 'active' ? 'active' : 'blocked';
        const userRole = u.role === 'admin' ? 'admin' : 'user';
        const tr = document.createElement('tr');
        tr.className = "hover:bg-glassBorder/10 transition-colors";

        const statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
            }">${escapeHtml(userStatus)}</span>`;

        tr.innerHTML = `
            <td class="p-4 font-bold text-gray-400">${userId}</td>
            <td class="p-4 font-semibold text-white">${escapeHtml(u.username || 'Unknown')}</td>
            <td class="p-4 text-gray-400">${escapeHtml(u.email || '')}</td>
            <td class="p-4 capitalize text-sky-400 font-semibold">${escapeHtml(userRole)}</td>
            <td class="p-4">${statusBadge}</td>
            <td class="p-4 space-x-2">
                <button onclick="toggleUserStatus(${userId}, '${userStatus}')" class="text-xs ${userStatus === 'active' ? 'text-rose-400 hover:underline' : 'text-emerald-400 hover:underline'}">
                    ${userStatus === 'active' ? 'Suspend' : 'Activate'}
                </button>
                <button onclick="toggleUserRole(${userId}, '${userRole}')" class="text-xs text-sky-400 hover:underline">
                    Make ${userRole === 'admin' ? 'User' : 'Admin'}
                </button>
                <button onclick="deleteUserAccount(${userId})" class="text-xs text-rose-500 font-bold hover:underline">
                    Delete
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

const toggleUserStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    try {
        const res = await EchoTraceAPI.post('admin/users/toggle', { id, status: newStatus });
        if (res.success) {
            loadAdminData();
        }
    } catch (e) {
        alert(e.message);
    }
};

const toggleUserRole = async (id, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
        const res = await EchoTraceAPI.post('admin/users/role', { id, role: newRole });
        if (res.success) {
            loadAdminData();
        }
    } catch (e) {
        alert(e.message);
    }
};

const deleteUserAccount = async (id) => {
    if (!confirm("Are you sure you want to permanently delete this user?")) return;
    try {
        const res = await EchoTraceAPI.delete(`admin/users/delete&id=${id}`);
        if (res.success) {
            loadAdminData();
        }
    } catch (e) {
        alert(e.message);
    }
};

const populateAdminFeedback = (reports) => {
    const tbody = document.getElementById('admin-feedback-table-body');
    tbody.innerHTML = '';

    if (!reports || reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500">No contact messages received yet.</td></tr>`;
        return;
    }

    reports.forEach(r => {
        const safeName = escapeHtml(r.name || 'Anonymous');
        const safeEmail = escapeHtml(r.email || '');
        const safeSubject = escapeHtml(r.subject || '(No subject)');
        const safeMessage = escapeHtml(r.message || '');
        const safeStatus = escapeHtml(r.status || 'New');
        const tr = document.createElement('tr');
        tr.className = "hover:bg-glassBorder/10 transition-colors";

        const statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">${safeStatus}</span>`;
        const date = new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

        tr.innerHTML = `
            <td class="p-4 font-semibold text-white">${safeName}</td>
            <td class="p-4 text-cyan-400">${safeEmail}</td>
            <td class="p-4 text-gray-300 font-medium">${safeSubject}</td>
            <td class="p-4 text-gray-400 max-w-xs truncate italic" title="${safeMessage}">"${safeMessage}"</td>
            <td class="p-4">${statusBadge}</td>
            <td class="p-4 text-gray-500 text-xs">${date}</td>
        `;
        tbody.appendChild(tr);
    });
};

const populateAdminReports = (reports) => {
    const tbody = document.getElementById('admin-reports-table-body');
    const countEl = document.getElementById('admin-reports-count');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!reports || reports.length === 0) {
        if (countEl) countEl.textContent = '0 reports';
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-gray-500">No scan reports found.</td></tr>`;
        return;
    }

    if (countEl) countEl.textContent = `${reports.length} report${reports.length !== 1 ? 's' : ''}`;

    reports.forEach(r => {
        const safeTitle = escapeHtml(r.product_title || 'N/A');
        const safePlatform = escapeHtml(r.platform || '');
        const safeScannedBy = escapeHtml(r.scanned_by || 'Anonymous');
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-glassBorder/10 transition-colors';
        const date = new Date(r.generated_at).toLocaleDateString();
        const trust = parseFloat(r.trust_score);
        const riskBadgeClass = trust >= 70 ? 'bg-emerald-500/10 text-emerald-400'
            : trust >= 40 ? 'bg-yellow-500/10 text-yellow-400'
                : 'bg-rose-500/10 text-rose-400';
        const riskLabel = escapeHtml(r.risk_level || (trust >= 70 ? 'Low Risk' : trust >= 40 ? 'Medium Risk' : 'High Risk'));

        tr.innerHTML = `
            <td class="p-3 md:p-4 font-semibold text-white max-w-xs truncate text-xs md:text-sm" title="${safeTitle}">${safeTitle}</td>
            <td class="p-3 md:p-4 text-gray-400 capitalize whitespace-nowrap text-xs">${safePlatform}</td>
            <td class="p-3 md:p-4 font-bold text-emeraldGreen whitespace-nowrap text-xs md:text-sm">${trust.toFixed(1)}%</td>
            <td class="p-3 md:p-4 text-rose-400 whitespace-nowrap text-xs md:text-sm">${r.fake_count ?? 0}</td>
            <td class="p-3 md:p-4 text-emerald-400 whitespace-nowrap text-xs md:text-sm">${r.genuine_count ?? 0}</td>
            <td class="p-3 md:p-4 whitespace-nowrap"><span class="px-2 py-0.5 rounded text-[9px] md:text-[10px] font-bold ${riskBadgeClass}">${riskLabel}</span></td>
            <td class="p-3 md:p-4 text-gray-400 whitespace-nowrap text-xs">${safeScannedBy}</td>
            <td class="p-3 md:p-4 text-gray-500 text-xs whitespace-nowrap">${date}</td>
        `;
        tbody.appendChild(tr);
    });
};

const populateAdminProducts = (products) => {
    const tbody = document.getElementById('admin-products-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!products || products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">No products found.</td></tr>`;
        return;
    }

    products.forEach(p => {
        const safeTitle = escapeHtml(p.title || 'Untitled product');
        const safePlatform = escapeHtml(p.platform || 'unknown');
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-glassBorder/10 transition-colors';
        const lastScanned = p.last_scanned ? new Date(p.last_scanned).toLocaleDateString() : '--';
        const fakePct = p.avg_fake_pct != null ? `${p.avg_fake_pct}%` : '--';
        const platformBadge = p.platform === 'shopee'
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-400">Shopee</span>`
            : p.platform === 'amazon'
                ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400">Amazon</span>`
                : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400">${safePlatform}</span>`;
        tr.innerHTML = `
            <td class="p-3 md:p-4 font-semibold text-white max-w-[220px] truncate" title="${safeTitle}">${safeTitle}</td>
            <td class="p-3 md:p-4 whitespace-nowrap">${platformBadge}</td>
            <td class="p-3 md:p-4 text-gray-300 whitespace-nowrap">${p.scan_count ?? 0}</td>
            <td class="p-3 md:p-4 text-rose-400 whitespace-nowrap">${fakePct}</td>
            <td class="p-3 md:p-4 text-gray-500 text-xs whitespace-nowrap">${lastScanned}</td>
        `;
        tbody.appendChild(tr);
    });
};

const populateAdminLogs = (aiLogs, loginLogs) => {
    const aiContainer = document.getElementById('admin-logs-ai');
    aiContainer.innerHTML = '';

    if (aiLogs.length === 0) {
        aiContainer.innerHTML = `<p class="text-gray-500 text-center py-4">No AI requests logged.</p>`;
    } else {
        aiLogs.forEach(l => {
            const div = document.createElement('div');
            const isFallback = l.api_endpoint.includes('[FALLBACK]');

            // Try to parse response payload
            let parsed = null;
            try { parsed = JSON.parse(l.response_payload); } catch (e) { }

            // Unified stats extraction for ALL log types
            let stats = null;

            if (parsed && parsed.success && parsed.metrics) {
                // Direct AI Engine response — has full metrics object
                const m = parsed.metrics;
                stats = {
                    total: m.total_scanned,
                    fake: m.fake_detected,
                    genuine: m.genuine_detected,
                    trust: parsed.trust_score != null ? parsed.trust_score : '--',
                    risk: parsed.overall_risk_level || '--',
                    mode: 'AI Engine'
                };
            } else if (parsed && parsed.fallback_response && parsed.fallback_response.results) {
                // Fallback mode — compute stats from results array
                const results = parsed.fallback_response.results;
                const fake = results.filter(r => r.is_fake === 1 || r.is_fake === true).length;
                const genuine = results.length - fake;
                const trust = parsed.fallback_response.trust_score != null ? parsed.fallback_response.trust_score : '--';
                const risk = trust >= 80 ? 'Low Risk' : trust >= 50 ? 'Medium Risk' : 'High Risk';
                stats = {
                    total: results.length,
                    fake,
                    genuine,
                    trust,
                    risk,
                    mode: 'Fallback Mode'
                };
            }

            let bodyHtml = '';
            if (stats) {
                const riskColor = stats.risk === 'Low Risk' ? 'text-emerald-400' : stats.risk === 'Medium Risk' ? 'text-yellow-400' : 'text-rose-400';
                const fakeColor = stats.fake > 0 ? 'text-rose-400' : 'text-gray-300';
                const modeClass = isFallback
                    ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                bodyHtml = `
                    <div class="grid grid-cols-4 gap-2 mt-2">
                        <div class="bg-white/5 rounded-lg p-2 text-center">
                            <div class="text-xs text-gray-500">Reviews</div>
                            <div class="font-bold text-white">${stats.total}</div>
                        </div>
                        <div class="bg-white/5 rounded-lg p-2 text-center">
                            <div class="text-xs text-gray-500">Fake</div>
                            <div class="font-bold ${fakeColor}">${stats.fake}</div>
                        </div>
                        <div class="bg-white/5 rounded-lg p-2 text-center">
                            <div class="text-xs text-gray-500">Genuine</div>
                            <div class="font-bold text-emerald-400">${stats.genuine}</div>
                        </div>
                        <div class="bg-white/5 rounded-lg p-2 text-center">
                            <div class="text-xs text-gray-500">Trust</div>
                            <div class="font-bold text-sky-400">${stats.trust}%</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-xs text-gray-500">Risk Level:</span>
                        <span class="text-xs font-semibold ${riskColor}">${stats.risk}</span>
                        <span class="ml-auto text-[10px] ${modeClass} px-2 py-0.5 rounded-full">${stats.mode}</span>
                    </div>
                `;
            } else {
                // Error-only log — show clean error message
                const errMsg = (parsed && parsed.error) ? parsed.error : (l.response_payload || '').substring(0, 150);
                bodyHtml = `<div class="text-xs text-rose-300 mt-1 font-mono bg-rose-500/5 p-2 rounded-lg break-all">${escapeHtml(errMsg)}</div>`;
            }

            // Human-readable label from endpoint path
            const endpointPath = l.api_endpoint.replace(/https?:\/\/[^/]+/, '').replace(' [FALLBACK]', '').trim();
            const labelMap = {
                '/analyze': 'Review Analysis',
                '/retrain': 'Model Retrain',
                '/health': 'Health Check'
            };
            const baseLabel = labelMap[endpointPath] || endpointPath;
            const cardLabel = isFallback ? `${baseLabel} — Fallback Mode` : `${baseLabel} — AI Engine`;

            div.className = `p-3 border rounded-xl ${isFallback ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-glassBg border-glassBorder'}`;
            div.innerHTML = `
                <div class="flex justify-between items-center font-bold">
                    <span class="${isFallback ? 'text-yellow-400' : 'text-gray-200'} text-sm">${escapeHtml(cardLabel)}</span>
                    <span class="${isFallback ? 'text-yellow-400' : 'text-emerald-400'} text-sm">${escapeHtml(l.duration_ms)}ms</span>
                </div>
                <div class="text-[10px] text-gray-500 mb-1">${escapeHtml(l.created_at)} &bull; <span class="font-mono opacity-60">${escapeHtml(l.api_endpoint)}</span></div>
                ${bodyHtml}
            `;
            aiContainer.appendChild(div);
        });
    }

    const authContainer = document.getElementById('admin-logs-auth');
    authContainer.innerHTML = '';

    if (loginLogs.length === 0) {
        authContainer.innerHTML = `<p class="text-gray-500 text-center py-4">No login events logged.</p>`;
    } else {
        loginLogs.forEach(l => {
            const div = document.createElement('div');
            const isSuccess = l.status === 'success';

            // Humanize IP address
            const rawIp = l.ip_address || 'Unknown';
            const displayIp = (rawIp === '::1' || rawIp === '127.0.0.1') ? 'Localhost' : rawIp;

            // Parse user-agent into readable client description
            const ua = l.user_agent || '';
            let clientLabel = 'Unknown Client';
            let clientIcon = '🖥️';
            if (/WindowsPowerShell|PowerShell/i.test(ua)) {
                clientLabel = 'PowerShell (Windows)'; clientIcon = '⚡';
            } else if (/PostmanRuntime/i.test(ua)) {
                clientLabel = 'Postman API Client'; clientIcon = '🔧';
            } else if (/curl/i.test(ua)) {
                clientLabel = 'cURL Command Line'; clientIcon = '💻';
            } else if (/Chrome/i.test(ua) && !/Edge|OPR/i.test(ua)) {
                clientLabel = 'Google Chrome'; clientIcon = '🌐';
            } else if (/Firefox/i.test(ua)) {
                clientLabel = 'Mozilla Firefox'; clientIcon = '🦊';
            } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
                clientLabel = 'Safari'; clientIcon = '🧭';
            } else if (/Edge/i.test(ua)) {
                clientLabel = 'Microsoft Edge'; clientIcon = '🌐';
            } else if (/OPR|Opera/i.test(ua)) {
                clientLabel = 'Opera'; clientIcon = '🎭';
            } else if (ua.length > 0) {
                clientLabel = ua.substring(0, 40) + (ua.length > 40 ? '…' : '');
            }

            // OS detection
            let osLabel = '';
            if (/Windows NT 10/i.test(ua)) osLabel = 'Windows 10/11';
            else if (/Windows NT 6/i.test(ua)) osLabel = 'Windows';
            else if (/Mac OS X/i.test(ua)) osLabel = 'macOS';
            else if (/Linux/i.test(ua)) osLabel = 'Linux';
            else if (/Android/i.test(ua)) osLabel = 'Android';
            else if (/iPhone|iPad/i.test(ua)) osLabel = 'iOS';

            div.className = `p-3 border rounded-xl ${isSuccess ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`;
            div.innerHTML = `
                <div class="flex justify-between items-center font-bold">
                    <span class="text-gray-200 text-sm">${escapeHtml(l.username || 'Anonymous')}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isSuccess ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}">${isSuccess ? '✓ SUCCESS' : '✗ FAILED'}</span>
                </div>
                <div class="text-[10px] text-gray-500 mb-2">${escapeHtml(l.created_at)}</div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-white/5 rounded-lg p-2">
                        <div class="text-xs text-gray-500 mb-0.5">IP Address</div>
                        <div class="text-xs font-semibold text-gray-300">${escapeHtml(displayIp)}</div>
                    </div>
                    <div class="bg-white/5 rounded-lg p-2">
                        <div class="text-xs text-gray-500 mb-0.5">Client</div>
                        <div class="text-xs font-semibold text-gray-300">${escapeHtml(clientIcon)} ${escapeHtml(clientLabel)}</div>
                    </div>
                </div>
                ${osLabel ? `<div class="text-[10px] text-gray-500 mt-1.5">OS: <span class="text-gray-400">${escapeHtml(osLabel)}</span></div>` : ''}
            `;
            authContainer.appendChild(div);
        });
    }
};

const triggerRetraining = async () => {
    const msgEl = document.getElementById('retrain-msg');
    const btn = document.getElementById('retrain-btn');
    const btnText = document.getElementById('retrain-btn-text');
    const results = document.getElementById('retrain-results');

    if (!msgEl) { console.warn('[triggerRetraining] #retrain-msg not found in DOM'); return; }

    // Show loading state
    msgEl.className = 'p-3 text-xs rounded-xl text-center bg-amber-500/10 text-amber-400';
    msgEl.textContent = '⏳ Training in progress... This may take 30–60 seconds. Please wait.';
    msgEl.classList.remove('hidden');
    if (results) results.classList.add('hidden');
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Training...';

    try {
        const res = await EchoTraceAPI.post('admin/ai/retrain');
        if (res.success) {
            msgEl.className = 'p-3 text-xs rounded-xl text-center bg-emerald-500/10 text-emerald-400';
            msgEl.textContent = '✅ ' + res.message;

            // Populate results panel
            const m = res.metrics || {};
            if (Object.keys(m).length > 0) {
                const fmt = (v) => v !== undefined ? v + '%' : '—';
                const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
                const bar = (id, pct) => { const el = document.getElementById(id); if (el) setTimeout(() => el.style.width = pct + '%', 100); };

                // Meta
                set('r-trained-at', m.trained_at ? new Date(m.trained_at).toLocaleString() : '—');
                set('r-total', m.total_samples?.toLocaleString() ?? '—');
                set('r-vocab', m.vocab_size?.toLocaleString() ?? '—');

                // Core metrics
                set('r-accuracy', fmt(m.test_accuracy ?? m.accuracy));
                set('r-f1', fmt(m.f1_score));
                set('r-roc', m.roc_auc ?? '—');
                set('r-cv', fmt(m.cv_mean_f1));

                // Confusion matrix
                const cm = m.confusion_matrix || {};
                set('r-tn', cm.tn ?? '—');
                set('r-fp', cm.fp ?? '—');
                set('r-fn', cm.fn ?? '—');
                set('r-tp', cm.tp ?? '—');

                // Per-class
                set('r-gp', fmt(m.genuine_precision)); bar('r-gp-bar', m.genuine_precision ?? 0);
                set('r-gr', fmt(m.genuine_recall)); bar('r-gr-bar', m.genuine_recall ?? 0);
                set('r-fp2', fmt(m.fake_precision)); bar('r-fp2-bar', m.fake_precision ?? 0);
                set('r-fr', fmt(m.fake_recall)); bar('r-fr-bar', m.fake_recall ?? 0);

                // CV fold badges
                const foldsEl = document.getElementById('r-cv-folds');
                if (foldsEl && m.cv_scores) {
                    foldsEl.innerHTML = m.cv_scores.map((s, i) =>
                        `<span class="px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 font-bold">Fold ${i + 1}: ${s}%</span>`
                    ).join('');
                }

                // Dataset split
                set('r-genuine', m.genuine_samples?.toLocaleString() ?? '—');
                set('r-fake', m.fake_samples?.toLocaleString() ?? '—');
                set('r-train', m.train_size?.toLocaleString() ?? '—');
                set('r-test', m.test_size?.toLocaleString() ?? '—');

                if (results) results.classList.remove('hidden');
                if (window.lucide) lucide.createIcons();
            }
            await Promise.all([loadAdminDashboard(), loadAdminAnalytics()]);
        } else {
            msgEl.className = 'p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400';
            msgEl.textContent = '❌ ' + (res.error || 'Retraining failed.');
        }
    } catch (e) {
        msgEl.className = 'p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400';
        msgEl.textContent = '❌ ' + e.message;
    } finally {
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Retrain Again';
    }
};

// --- THEME & UTILITIES ---

const toggleTheme = () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    html.setAttribute('data-theme', newTheme);

    const icon = document.getElementById('theme-icon-sun');
    if (newTheme === 'light') {
        icon.setAttribute('data-lucide', 'moon');
    } else {
        icon.setAttribute('data-lucide', 'sun');
    }
    lucide.createIcons();
};

// -------------------
// RAG MACHINE LEARNING & COPILOT CONTROLLERS
// -------------------

const loadRagAssistant = async () => {
    try {
        await refreshRagStats();
        await loadRagKnowledgeBase();
    } catch (e) {
        console.error("Failed to initialize RAG Assistant:", e);
    }
};

const refreshRagStats = async () => {
    try {
        const res = await EchoTraceAPI.ragStats();
        if (res.success && res.stats) {
            const stats = res.stats;
            const statusBadge = document.getElementById('rag-status-badge');
            if (statusBadge) {
                statusBadge.textContent = stats.is_indexed ? 'TF-IDF Active' : 'Unindexed';
                statusBadge.className = stats.is_indexed ? 'text-sm font-bold text-emerald-400' : 'text-sm font-bold text-rose-400';
            }
            const docCountEl = document.getElementById('rag-doc-count');
            if (docCountEl) docCountEl.textContent = `${stats.total_documents} Docs`;

            const chunkCountEl = document.getElementById('rag-chunk-count');
            if (chunkCountEl) chunkCountEl.textContent = `${stats.total_chunks} Chunks`;

            const vocabEl = document.getElementById('rag-vocab-size');
            if (vocabEl) vocabEl.textContent = `${stats.vocabulary_size} Terms`;
        }
    } catch (e) {
        console.error("Error refreshing RAG stats:", e);
    }
};

const switchRagTab = (tabName) => {
    document.querySelectorAll('.rag-tab-content').forEach(el => el.classList.add('hidden'));

    const copilotBtn = document.getElementById('rag-tab-btn-copilot');
    const knowledgeBtn = document.getElementById('rag-tab-btn-knowledge');

    if (tabName === 'copilot') {
        document.getElementById('rag-tab-copilot').classList.remove('hidden');
        copilotBtn.className = 'px-4 py-2 rounded-lg font-bold bg-gradient-to-r from-emeraldGreen to-skyBlue text-white transition-all';
        knowledgeBtn.className = 'px-4 py-2 rounded-lg font-bold text-gray-400 hover:text-white transition-all';
    } else {
        document.getElementById('rag-tab-knowledge').classList.remove('hidden');
        knowledgeBtn.className = 'px-4 py-2 rounded-lg font-bold bg-gradient-to-r from-emeraldGreen to-skyBlue text-white transition-all';
        copilotBtn.className = 'px-4 py-2 rounded-lg font-bold text-gray-400 hover:text-white transition-all';
        loadRagKnowledgeBase();
    }
    lucide.createIcons();
};

const fillRagQuery = (promptText) => {
    const inputEl = document.getElementById('rag-query-input');
    if (inputEl) {
        inputEl.value = promptText;
        inputEl.focus();
    }
};

const submitRagQuery = async (e) => {
    e.preventDefault();
    const inputEl = document.getElementById('rag-query-input');
    const query = inputEl.value.trim();
    if (!query) return;

    const category = document.getElementById('rag-query-category').value;
    const btnEl = document.getElementById('rag-query-btn');

    appendRagUserMessage(query);
    inputEl.value = '';

    btnEl.disabled = true;
    btnEl.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Retrieving...</span>`;
    lucide.createIcons();

    try {
        const res = await EchoTraceAPI.ragQuery(query, 3, category);
        if (res.success && res.rag) {
            appendRagAssistantResponse(res.rag);
        } else {
            appendRagAssistantError(res.error || "RAG retrieval query failed.");
        }
    } catch (err) {
        appendRagAssistantError(err.message || "Failed to connect to RAG AI microservice.");
    } finally {
        btnEl.disabled = false;
        btnEl.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Search & Synthesize</span>`;
        lucide.createIcons();
    }
};

const appendRagUserMessage = (query) => {
    const container = document.getElementById('rag-chat-output');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'flex items-start justify-end space-x-3';
    const bubble = document.createElement('div');
    bubble.className = 'glass-panel p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-white leading-relaxed max-w-xl';
    const text = document.createElement('p');
    text.className = 'font-semibold';
    text.textContent = query;
    bubble.appendChild(text);
    const avatar = document.createElement('div');
    avatar.className = 'w-8 h-8 rounded-xl bg-glassBorder flex items-center justify-center text-gray-300 font-bold text-xs shrink-0';
    avatar.textContent = 'YOU';
    msgDiv.append(bubble, avatar);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
};

const appendRagAssistantResponse = (ragData) => {
    const container = document.getElementById('rag-chat-output');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'flex items-start space-x-3 animate-fade-in';

    const icon = document.createElement('div');
    icon.className = 'w-8 h-8 rounded-xl bg-gradient-to-r from-emeraldGreen to-skyBlue flex items-center justify-center text-white font-bold text-xs shrink-0';
    icon.textContent = 'AI';
    const bubble = document.createElement('div');
    bubble.className = 'glass-panel p-5 rounded-2xl border border-glassBorder text-xs text-gray-200 leading-relaxed max-w-2xl space-y-3 shadow-xl';
    const heading = document.createElement('div');
    heading.className = 'text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-glassBorder pb-2';
    heading.textContent = 'Retrieval-assisted template response';
    const answer = document.createElement('div');
    answer.className = 'text-gray-200 leading-relaxed whitespace-pre-line';
    answer.textContent = String(ragData.answer || 'No answer returned.');
    bubble.append(heading, answer);
    const similarity = Number(ragData.retrieval_similarity);
    if (Number.isFinite(similarity)) {
        const note = document.createElement('div');
        note.className = 'text-[10px] text-emerald-400 font-semibold';
        note.textContent = `Retrieval similarity: ${Math.round(similarity)}% (relevance, not confidence)`;
        bubble.appendChild(note);
    }
    const sources = Array.isArray(ragData.sources) ? ragData.sources : [];
    if (sources.length) {
        const sourceSection = document.createElement('div');
        sourceSection.className = 'mt-4 pt-3 border-t border-glassBorder space-y-2';
        const title = document.createElement('div');
        title.className = 'text-[10px] uppercase tracking-wider text-emerald-400 font-bold';
        title.textContent = `Retrieved sources (${sources.length})`;
        sourceSection.appendChild(title);
        sources.forEach((src) => {
            const card = document.createElement('div');
            card.className = 'p-2.5 rounded-xl bg-black/40 border border-glassBorder text-[11px] space-y-1';
            const sourceTitle = document.createElement('div');
            sourceTitle.className = 'font-bold text-white';
            sourceTitle.textContent = String(src?.title || 'Untitled source');
            const sourceSnippet = document.createElement('p');
            sourceSnippet.className = 'text-gray-400 italic font-mono text-[10px] leading-tight';
            sourceSnippet.textContent = String(src?.snippet || '').slice(0, 160);
            card.append(sourceTitle, sourceSnippet);
            sourceSection.appendChild(card);
        });
        bubble.appendChild(sourceSection);
    }
    msgDiv.append(icon, bubble);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
    lucide.createIcons();
};

const appendRagAssistantError = (errorMsg) => {
    const container = document.getElementById('rag-chat-output');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'flex items-start space-x-3';
    const icon = document.createElement('div');
    icon.className = 'w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 font-bold text-xs shrink-0';
    icon.textContent = 'AI';
    const bubble = document.createElement('div');
    bubble.className = 'glass-panel p-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 text-xs text-rose-300 leading-relaxed max-w-xl';
    const title = document.createElement('p');
    title.className = 'font-bold text-rose-400';
    title.textContent = 'RAG Engine Error';
    const message = document.createElement('p');
    message.textContent = String(errorMsg || 'The RAG service could not complete the request.');
    bubble.append(title, message);
    msgDiv.append(icon, bubble);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
};

let ragKnowledgeRequestId = 0;

const renderRagKnowledgeMessage = (tbody, message, tone = 'muted', retry = false) => {
    tbody.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = `p-8 text-center ${tone === 'error' ? 'text-rose-400' : 'text-gray-500'}`;
    const messageEl = document.createElement('span');
    messageEl.textContent = message;
    cell.appendChild(messageEl);
    if (retry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ml-3 px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10';
        button.textContent = 'Retry';
        button.addEventListener('click', loadRagKnowledgeBase);
        cell.appendChild(button);
    }
    row.appendChild(cell);
    tbody.appendChild(row);
};

const loadRagKnowledgeBase = async () => {
    const tbody = document.getElementById('rag-docs-table-body');
    if (!tbody) return;
    const requestId = ++ragKnowledgeRequestId;
    renderRagKnowledgeMessage(tbody, 'Loading indexed documents...');

    try {
        const res = await EchoTraceAPI.ragKnowledge();
        if (requestId !== ragKnowledgeRequestId) return;
        if (!res?.success) throw new Error(res?.error || 'The indexed documents could not be loaded.');
        if (!Array.isArray(res.documents)) throw new Error('The knowledge service returned an invalid document list.');

        tbody.replaceChildren();
        if (res.documents.length === 0) {
            renderRagKnowledgeMessage(tbody, 'No documents in vector store. Click Re-Index Store to populate defaults.');
            return;
        }

        res.documents.forEach((doc) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-glassBorder/10 transition-colors';

            const catBadge = doc.category === 'policy' ? 'bg-sky-500/10 text-sky-400' :
                doc.category === 'fraud_pattern' ? 'bg-rose-500/10 text-rose-400' :
                    doc.category === 'case_study' ? 'bg-purple-500/10 text-purple-400' :
                        'bg-emerald-500/10 text-emerald-400';

            const addCell = (className, text) => {
                const cell = document.createElement('td');
                cell.className = className;
                cell.textContent = String(text);
                tr.appendChild(cell);
                return cell;
            };
            addCell('p-4 font-mono text-[10px] text-gray-400', doc.id || '—');
            addCell('p-4 font-semibold text-white max-w-xs truncate', doc.title || 'Untitled document');
            const categoryCell = document.createElement('td');
            categoryCell.className = 'p-4';
            const categoryBadge = document.createElement('span');
            categoryBadge.className = `px-2 py-0.5 rounded text-[9px] font-bold uppercase ${catBadge}`;
            categoryBadge.textContent = String(doc.category || 'general');
            categoryCell.appendChild(categoryBadge);
            tr.appendChild(categoryCell);
            const tagsCell = document.createElement('td');
            tagsCell.className = 'p-4';
            const tags = Array.isArray(doc.tags) ? doc.tags : [];
            if (tags.length) {
                tags.forEach((tag) => {
                    const tagBadge = document.createElement('span');
                    tagBadge.className = 'inline-block mr-1 mb-1 bg-gray-500/10 text-gray-400 px-1.5 py-0.5 rounded text-[9px]';
                    tagBadge.textContent = `#${String(tag)}`;
                    tagsCell.appendChild(tagBadge);
                });
            } else {
                tagsCell.textContent = '—';
                tagsCell.classList.add('text-gray-600');
            }
            tr.appendChild(tagsCell);
            addCell('p-4 font-bold text-gray-300', `${Number(doc.chunk_count) || 1} chunks`);
            const actionCell = document.createElement('td');
            actionCell.className = 'p-4 text-center';
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 p-1.5 rounded-lg transition-colors';
            deleteButton.title = 'Delete Document';
            deleteButton.setAttribute('aria-label', `Delete ${doc.title || 'knowledge document'}`);
            deleteButton.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
            deleteButton.addEventListener('click', () => deleteKnowledgeDoc(String(doc.id || '')));
            actionCell.appendChild(deleteButton);
            tr.appendChild(actionCell);
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    } catch (e) {
        if (requestId !== ragKnowledgeRequestId) return;
        renderRagKnowledgeMessage(tbody, `Failed to load knowledge base: ${e.message}`, 'error', true);
    }
};

const openAddKnowledgeModal = () => {
    document.getElementById('rag-add-modal').classList.remove('hidden');
};

const closeAddKnowledgeModal = () => {
    document.getElementById('rag-add-modal').classList.add('hidden');
};

const submitAddKnowledge = async (e) => {
    e.preventDefault();
    const title = document.getElementById('rag-add-title').value.trim();
    const category = document.getElementById('rag-add-category').value;
    const tagsStr = document.getElementById('rag-add-tags').value.trim();
    const content = document.getElementById('rag-add-content').value.trim();

    if (!title || !content) return;

    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];

    try {
        const res = await EchoTraceAPI.ragAddKnowledge(title, content, category, tags);
        if (res.success) {
            closeAddKnowledgeModal();
            document.getElementById('rag-add-form').reset();
            await refreshRagStats();
            await loadRagKnowledgeBase();
            alert("Document successfully indexed in RAG vector store!");
        } else {
            alert(res.error || "Failed to add document");
        }
    } catch (err) {
        alert("Error indexing document: " + err.message);
    }
};

const deleteKnowledgeDoc = async (docId) => {
    if (!confirm(`Are you sure you want to delete knowledge document '${docId}' from the vector store?`)) return;

    try {
        const res = await EchoTraceAPI.ragDeleteKnowledge(docId);
        if (res.success) {
            await refreshRagStats();
            await loadRagKnowledgeBase();
        } else {
            alert(res.error || "Failed to delete document");
        }
    } catch (e) {
        alert("Error deleting document: " + e.message);
    }
};

const reindexRagStore = async () => {
    try {
        const res = await EchoTraceAPI.ragReindex();
        if (res.success) {
            await refreshRagStats();
            await loadRagKnowledgeBase();
            alert("RAG Vector Store re-indexed successfully!");
        } else {
            alert(res.error || "Reindex failed");
        }
    } catch (e) {
        alert("Error re-indexing vector store: " + e.message);
    }
};

// ─── AUDIT HISTORY PAGE ────────────────────────────────────────────────────

let allAuditScans = [];
let filteredAuditScans = [];
let currentHistoryPage = 1;
const auditHistoryPerPage = 10;
let auditHistoryRequestSequence = 0;

const refreshAuditHistoryIfVisible = () => {
    const currentPage = (window.location.hash.substring(1) || '').split('?')[0];
    if (currentPage === 'audit-history' && EchoTraceAuth.isAuthenticated()) {
        loadAuditHistory();
    }
};

const showAuditHistoryStatus = (message, options = {}) => {
    const tbody = document.getElementById('audit-history-table-body');
    if (!tbody) return;

    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = `p-8 text-center ${options.isError ? 'text-rose-300' : 'text-gray-400'}`;

    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    cell.appendChild(messageElement);

    if (options.retry) {
        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.className = 'mt-4 text-xs bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 px-4 py-2 rounded-lg hover:bg-cyan-500 hover:text-slate-950 transition-all';
        retryButton.textContent = 'Try Again';
        retryButton.addEventListener('click', loadAuditHistory);
        cell.appendChild(retryButton);
    }

    row.appendChild(cell);
    tbody.replaceChildren(row);
};

const loadAuditHistory = async () => {
    if (typeof EchoTraceAuth !== 'undefined' && typeof EchoTraceAuth.ready === 'function') {
        await EchoTraceAuth.ready();
    }
    if (!EchoTraceAuth.isAuthenticated()) return;

    const requestId = ++auditHistoryRequestSequence;
    if (!allAuditScans || allAuditScans.length === 0) {
        showAuditHistoryStatus('Loading audit history...');
    }
    let data = null;
    let lastError = null;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (requestId !== auditHistoryRequestSequence) return;
        try {
            data = await EchoTraceAPI.get('scan/history');
            if (data && data.success && Array.isArray(data.history)) {
                break;
            }
            lastError = new Error(data?.error || 'Invalid audit history response.');
        } catch (e) {
            lastError = e;
            if (e?.status === 401 || e?.status === 403 || e?.code === 'unauthorized') {
                break;
            }
            if (attempt < maxAttempts) {
                const delayMs = attempt * 300;
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    if (requestId !== auditHistoryRequestSequence) return;

    if (!data || !data.success || !Array.isArray(data.history)) {
        console.error('[EchoTrace] Audit history request failed:', lastError?.message || lastError);
        if (allAuditScans && allAuditScans.length > 0) {
            if (typeof showNotification === 'function') {
                showNotification('Unable to refresh audit history.', 'warning');
            }
            return;
        }
        allAuditScans = [];
        filteredAuditScans = [];
        currentHistoryPage = 1;
        updateAuditHistorySummary();
        document.getElementById('history-result-count').textContent = '0 scans';
        updateAuditHistoryPagination();
        showAuditHistoryStatus('Unable to load audit history. Check your connection and try again.', {
            isError: true,
            retry: true
        });
        return;
    }


    allAuditScans = data.history.filter(scan => scan && typeof scan === 'object');
    filteredAuditScans = [...allAuditScans];
    currentHistoryPage = 1;
    try {
        populateAuditHistoryTable();
        updateAuditHistorySummary();
    } catch (renderError) {
        // Keep the valid API data available for retry/filter actions. A render
        // problem is not an authentication or empty-history response.
        console.error('[EchoTrace] Audit history render failed:', renderError?.message || renderError);
        showAuditHistoryStatus('Audit history was loaded but could not be rendered. Please retry.', {
            isError: true,
            retry: true
        });
    }
};

const populateAuditHistoryTable = () => {
    const tbody = document.getElementById('audit-history-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filteredAuditScans.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="p-8 text-center text-gray-500">
                    <div class="flex flex-col items-center justify-center gap-3">
                        <i data-lucide="inbox" class="w-12 h-12 text-gray-600"></i>
                        <p>No audit history found.</p>
                        <button onclick="openScanModal()" class="mt-2 text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg hover:bg-emerald-500 hover:text-white transition-all">
                            Open Screenshot Analyzer
                        </button>
                    </div>
                </td>
            </tr>
        `;
        document.getElementById('history-result-count').textContent = '0 scans';
        updateAuditHistoryPagination();
        if (window.lucide?.createIcons) window.lucide.createIcons();
        return;
    }

    // Pagination
    const startIdx = (currentHistoryPage - 1) * auditHistoryPerPage;
    const endIdx = startIdx + auditHistoryPerPage;
    const paginatedScans = filteredAuditScans.slice(startIdx, endIdx);

    paginatedScans.forEach(s => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-glassBorder/10 transition-colors";

        // Platform Badge
        const platform = String(s.platform || 'unknown').toLowerCase();
        const platformLabel = platform.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
        const productTitle = String(s.product_title || 'Untitled product');
        const safeProductTitle = productTitle.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
        const platformBadge = `<span class="px-2.5 py-1 text-[10px] font-bold rounded-lg border uppercase ${platform === 'amazon' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                platform === 'shopee' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
                    platform === 'lazada' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                        platform === 'ebay' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                            'bg-sky-500/10 border-sky-500/20 text-sky-400'
            }">${platformLabel}</span>`;

        // Trust Score
        const parsedTrust = parseFloat(s.trust_score);
        const trustPct = Number.isFinite(parsedTrust) ? parsedTrust : 0;
        const trustClass = trustPct >= 80 ? 'text-emerald-400' : (trustPct >= 50 ? 'text-amber-400' : 'text-rose-400');

        // Risk Level
        const riskLevel = (s.risk_level || 'Low Risk').toUpperCase();
        const safeRiskLevel = escapeHtml(riskLevel);
        const riskClass = riskLevel.includes('HIGH') ? 'bg-rose-500/10 text-rose-400' :
            (riskLevel.includes('MEDIUM') ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400');

        // Date formatting
        const parsedDate = new Date(s.scan_date);
        const date = Number.isNaN(parsedDate.getTime()) ? 'Date unavailable' : parsedDate.toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        // Review counts
        const fakeCount = parseInt(s.fake_count || 0);
        const genuineCount = parseInt(s.genuine_count || 0);
        const uncertainCount = parseInt(s.uncertain_count || 0);
        const totalReviews = fakeCount + genuineCount + uncertainCount;

        tr.innerHTML = `
            <td class="px-6 py-4">${platformBadge}</td>
            <td class="px-6 py-4 font-semibold text-white max-w-xs truncate" title="${safeProductTitle}">${safeProductTitle}</td>
            <td class="px-6 py-4 font-bold ${trustClass}">${trustPct.toFixed(2)}%</td>
            <td class="px-6 py-4 text-gray-400 text-xs">
                <span class="text-rose-400">${fakeCount}</span> suspicious / <span class="text-emerald-400">${genuineCount}</span> genuine / <span class="text-amber-400">${uncertainCount}</span> uncertain
            </td>
            <td class="px-6 py-4 text-gray-400 text-xs">${date}</td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-[10px] font-bold rounded-lg ${riskClass}">
                    ${safeRiskLevel}
                </span>
            </td>
            <td class="px-6 py-4 text-center">
                <button type="button" class="audit-history-view text-xs bg-emeraldGreen/10 border border-emeraldGreen/30 text-emeraldGreen px-3 py-1 rounded-lg hover:bg-emeraldGreen hover:text-white transition-all">
                    View
                </button>
            </td>
        `;
        const auditScanId = Number(s.id);
        if (Number.isInteger(auditScanId) && auditScanId > 0) {
            tr.querySelector('.audit-history-view').addEventListener('click', () => openDashboardFullReport(auditScanId));
        } else {
            tr.querySelector('.audit-history-view').disabled = true;
        }
        tbody.appendChild(tr);
    });

    // Update result count
    document.getElementById('history-result-count').textContent = `${filteredAuditScans.length} scan${filteredAuditScans.length !== 1 ? 's' : ''}`;

    // Update pagination
    updateAuditHistoryPagination();
    if (window.lucide?.createIcons) window.lucide.createIcons();
};

const filterAuditHistory = () => {
    const searchTerm = document.getElementById('history-search-bar').value.toLowerCase();
    const platformFilter = document.getElementById('history-platform-filter').value.toLowerCase();
    const trustFilter = document.getElementById('history-trust-filter').value;

    filteredAuditScans = allAuditScans.filter(s => {
        // Search filter
        const matchesSearch = !searchTerm ||
            String(s.product_title || '').toLowerCase().includes(searchTerm) ||
            String(s.platform || '').toLowerCase().includes(searchTerm);

        // Platform filter
        const matchesPlatform = !platformFilter || String(s.platform || '').toLowerCase() === platformFilter;

        // Trust score filter
        let matchesTrust = true;
        if (trustFilter) {
            const trustScore = parseFloat(s.trust_score);
            if (trustFilter === 'high') matchesTrust = trustScore >= 80;
            else if (trustFilter === 'medium') matchesTrust = trustScore >= 50 && trustScore < 80;
            else if (trustFilter === 'low') matchesTrust = trustScore < 50;
        }

        return matchesSearch && matchesPlatform && matchesTrust;
    });

    currentHistoryPage = 1;
    populateAuditHistoryTable();
};

const updateAuditHistorySummary = () => {
    // Total scans
    document.getElementById('history-total-scans').textContent = allAuditScans.length;

    // Average trust score
    if (allAuditScans.length > 0) {
        const avgTrust = allAuditScans.reduce((sum, s) => sum + parseFloat(s.trust_score || 0), 0) / allAuditScans.length;
        document.getElementById('history-avg-trust').textContent = `${avgTrust.toFixed(2)}%`;
    } else {
        document.getElementById('history-avg-trust').textContent = '0.0%';
    }

    // Total reviews analyzed
    let totalReviewsCount = 0;
    allAuditScans.forEach(s => {
        totalReviewsCount += parseInt(s.fake_count || 0) + parseInt(s.genuine_count || 0) + parseInt(s.uncertain_count || 0);
    });
    document.getElementById('history-total-reviews').textContent = totalReviewsCount;
};

const updateAuditHistoryPagination = () => {
    const totalPages = Math.ceil(filteredAuditScans.length / auditHistoryPerPage);
    const paginationEl = document.getElementById('history-pagination');
    const paginationInfoEl = document.getElementById('pagination-info');

    if (totalPages > 1) {
        paginationEl.classList.remove('hidden');
        paginationInfoEl.textContent = `Page ${currentHistoryPage} of ${totalPages}`;
    } else {
        paginationEl.classList.add('hidden');
    }
};

const nextHistoryPage = () => {
    const totalPages = Math.ceil(filteredAuditScans.length / auditHistoryPerPage);
    if (currentHistoryPage < totalPages) {
        currentHistoryPage++;
        populateAuditHistoryTable();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

const previousHistoryPage = () => {
    if (currentHistoryPage > 1) {
        currentHistoryPage--;
        populateAuditHistoryTable();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

// --- PERFORMANCE OPTIMIZATION ---

// Measure and log page performance
const measurePerformance = () => {
    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation) {
        const loadTime = Math.round(navigation.loadEventEnd || navigation.duration || 0);
        const domReady = Math.round(navigation.domContentLoadedEventEnd || 0);
        console.log(`[Performance] Page load time: ${loadTime}ms`);
        console.log(`[Performance] DOM ready time: ${domReady}ms`);
        if (loadTime > 3000) {
            console.warn('[Performance] Slow load detected. Consider clearing browser cache.');
        }
    }
};

// Fast cache clearing function
window.clearEchoTraceCache = () => {
    localStorage.setItem('forceRefresh', 'true');
    sessionStorage.clear();

    // Clear specific EchoTrace data
    const keysToRemove = [];
    for (let key in localStorage) {
        if (key.startsWith('echotrace_') || key.includes('maintenance')) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    window.location.reload(true);
};

// Add performance measurement on load
window.addEventListener('load', measurePerformance);

// Quick debug info
console.log('[EchoTrace] Frontend version loaded: 20261022-13');
