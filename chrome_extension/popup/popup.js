// chrome_extension/popup/popup.js
// EchoTrace - Universal Multi-Platform Scanner Extension Popup

const DEFAULT_API_URL = (typeof EchoTraceConfig !== "undefined") ? EchoTraceConfig.API_URL : "http://localhost/capsatone2/backend/api/index.php";

let currentReviewTarget = 10;
let activeScanTabId = null;
let activeScanListener = null;
let activeSafetyTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    initPopup();

    // Bind auth forms & navigation
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);

    // OTP form actions
    document.getElementById('otp-form')?.addEventListener('submit', handleOtpSubmit);
    document.getElementById('otp-resend-btn')?.addEventListener('click', handleOtpResend);
    document.getElementById('otp-cancel-btn')?.addEventListener('click', () => showPane('login'));

    // Header buttons
    document.getElementById('dashboard-btn')?.addEventListener('click', handleOpenDashboard);
    document.getElementById('settings-btn')?.addEventListener('click', openSettingsPane);
    document.getElementById('close-settings-btn')?.addEventListener('click', () => loadUserState());

    // Google Auth button in popup
    document.getElementById('google-auth-btn')?.addEventListener('click', handleGoogleAuth);

    // Settings actions
    document.getElementById('refresh-conn-btn')?.addEventListener('click', () => checkApiHealth(DEFAULT_API_URL));
    document.getElementById('settings-auth-action-btn')?.addEventListener('click', handleSettingsAuthAction);
    initSettingsTargetChips();

    // Results panel controls
    document.getElementById('close-results-btn')?.addEventListener('click', dismissResults);
    document.getElementById('results-view-report')?.addEventListener('click', handleViewReportClick);
    document.getElementById('results-view-modal-btn')?.addEventListener('click', handleViewModalClick);

    // History quick link
    document.getElementById('history-nav-btn')?.addEventListener('click', handleOpenDashboard);

    // Primary Scan Reviews button
    document.getElementById('popup-scan-btn')?.addEventListener('click', handlePopupScanClick);

    // Cancel scan button
    document.getElementById('cancel-scan-btn')?.addEventListener('click', handleCancelScan);

    // Target reviews selector chips
    initTargetChips();

    // Toggle Flagged Reviews Accordion
    document.getElementById('toggle-flagged-btn')?.addEventListener('click', toggleFlaggedReviews);

    // Detect platform of current active browser tab
    detectCurrentTabPlatform();
});

// ─── PLATFORM DETECTION FOR CURRENT TAB ────────────────────────────────────

const detectCurrentTabPlatform = () => {
    const dot = document.getElementById('platform-dot');
    const nameEl = document.getElementById('platform-name');
    const descEl = document.getElementById('platform-state-desc');
    const badgeEl = document.getElementById('platform-badge');
    const scanBtn = document.getElementById('popup-scan-btn');

    if (!nameEl) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0] || !tabs[0].url) {
            nameEl.textContent = 'No Active Tab';
            descEl.textContent = 'Open an ecommerce product page';
            if (badgeEl) { badgeEl.textContent = 'Idle'; badgeEl.className = 'platform-pill'; }
            return;
        }

        const rawUrl = tabs[0].url;
        let hostname = '';
        try {
            hostname = new URL(rawUrl).hostname.toLowerCase();
        } catch (_) {
            nameEl.textContent = 'Browser System Tab';
            descEl.textContent = 'Navigate to an online store';
            if (badgeEl) { badgeEl.textContent = 'Idle'; badgeEl.className = 'platform-pill'; }
            return;
        }

        let platform = null;
        let friendlyName = 'Unknown Platform';

        if (hostname.includes('shopee.')) {
            platform = 'shopee';
            friendlyName = 'Shopee Marketplace';
        } else if (hostname.includes('lazada.')) {
            platform = 'lazada';
            friendlyName = 'Lazada Store';
        } else if (hostname.includes('amazon.')) {
            platform = 'amazon';
            friendlyName = 'Amazon';
        } else if (hostname.includes('tiktok.com')) {
            platform = 'tiktok';
            friendlyName = 'TikTok Shop';
        } else if (hostname.includes('ebay.') || hostname.includes('aliexpress.') || hostname.includes('walmart.')) {
            platform = 'generic';
            friendlyName = 'Supported Ecommerce';
        }

        if (platform) {
            if (dot) dot.className = 'platform-indicator-dot active';
            nameEl.textContent = friendlyName;
            descEl.textContent = 'Product reviews ready for audit';
            if (badgeEl) {
                badgeEl.textContent = 'Ready';
                badgeEl.className = 'platform-pill supported';
            }
            if (scanBtn) scanBtn.disabled = false;
        } else {
            if (dot) dot.className = 'platform-indicator-dot warning';
            nameEl.textContent = hostname || 'Non-Ecommerce Page';
            descEl.textContent = 'Open Shopee, Lazada, Amazon, or TikTok';
            if (badgeEl) {
                badgeEl.textContent = 'Standby';
                badgeEl.className = 'platform-pill unsupported';
            }
        }
    });
};

// ─── TARGET REVIEWS SELECTOR (10 / 20 / 50) ────────────────────────────────

const initTargetChips = () => {
    chrome.storage.local.get(['review_target'], (items) => {
        if (items.review_target && [10, 20, 50].includes(Number(items.review_target))) {
            currentReviewTarget = Number(items.review_target);
        }
        updateTargetChipsUI(currentReviewTarget);
    });

    document.querySelectorAll('.target-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const val = parseInt(chip.dataset.target, 10);
            if ([10, 20, 50].includes(val)) {
                currentReviewTarget = val;
                chrome.storage.local.set({ review_target: val });
                updateTargetChipsUI(val);
            }
        });
    });
};

const updateTargetChipsUI = (selected) => {
    const hintEl = document.getElementById('target-hint');
    if (hintEl) hintEl.textContent = `${selected} unique reviews`;

    document.querySelectorAll('.target-chip').forEach(chip => {
        const chipVal = parseInt(chip.dataset.target, 10);
        if (chipVal === selected) {
            chip.classList.add('active');
            chip.setAttribute('aria-checked', 'true');
        } else {
            chip.classList.remove('active');
            chip.setAttribute('aria-checked', 'false');
        }
    });
};

// ─── SCAN INITIATION, PROGRESS & CANCELLATION ──────────────────────────────

const updateProgressStage = (stage, title, desc, percent) => {
    const progressCard = document.getElementById('scanning-progress');
    const badge = document.getElementById('scanning-stage-badge');
    const titleEl = document.getElementById('scanning-stage-title');
    const descEl = document.getElementById('scanning-stage-desc');
    const bar = document.getElementById('scanning-progress-fill');

    if (progressCard) progressCard.classList.remove('hidden');
    if (badge) badge.textContent = `Stage ${stage} of 4`;
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
    if (bar) bar.style.width = `${percent}%`;
};

const handlePopupScanClick = () => {
    const scanBtn = document.getElementById('popup-scan-btn');
    const scanBtnText = document.getElementById('popup-scan-btn-text');
    const progressCard = document.getElementById('scanning-progress');

    if (!scanBtn || scanBtn.disabled) return;

    scanBtn.disabled = true;
    if (scanBtnText) scanBtnText.textContent = 'Scanning in progress…';

    updateProgressStage(1, 'Detecting platform…', 'Validating product review elements', 25);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) {
            resetScanUI();
            return;
        }

        const tabId = tabs[0].id;
        activeScanTabId = tabId;

        // Cleanup any previous listener
        if (activeScanListener) {
            chrome.runtime.onMessage.removeListener(activeScanListener);
            activeScanListener = null;
        }

        // Real-time listener for scan progress & completion events
        activeScanListener = (message) => {
            if (message.action === 'SCAN_PROGRESS') {
                if (message.stage === 'collecting') {
                    updateProgressStage(2, `Collecting reviews (${message.count}/${message.target})`, 'Gathering unique customer feedback', 50);
                } else if (message.stage === 'analyzing') {
                    updateProgressStage(3, 'Analyzing reviews with AI…', 'Evaluating linguistic and behavioral patterns', 75);
                } else if (message.stage === 'saving') {
                    updateProgressStage(4, 'Saving audit report…', 'Committing audit metrics to Recent History', 90);
                }
            } else if (message.action === 'SCAN_RESULT' || message.action === 'SCAN_ERROR') {
                cleanupActiveScan();
                resetScanUI();

                if (message.action === 'SCAN_ERROR') {
                    const banner = document.getElementById('connection-banner');
                    if (banner) {
                        banner.className = 'status-banner error';
                        banner.textContent = message.error || 'Scan failed. Check backend status.';
                    }
                }
            }
        };
        chrome.runtime.onMessage.addListener(activeScanListener);

        // Safety timeout
        if (activeSafetyTimer) clearTimeout(activeSafetyTimer);
        activeSafetyTimer = setTimeout(() => {
            cleanupActiveScan();
            resetScanUI();
            const banner = document.getElementById('connection-banner');
            if (banner) {
                banner.className = 'status-banner error';
                banner.textContent = 'Scan timed out. Make sure local backend and AI services are running.';
            }
        }, 50000);

        // Trigger the scan in content script with configured target
        chrome.tabs.sendMessage(tabId, { action: 'TRIGGER_SCAN', target: currentReviewTarget }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                cleanupActiveScan();
                resetScanUI();
                const errMsg = chrome.runtime.lastError
                    ? 'Please refresh the ecommerce page and try again.'
                    : (response && response.error ? response.error : 'Could not initiate scan on this page.');
                const banner = document.getElementById('connection-banner');
                if (banner) {
                    banner.className = 'status-banner error';
                    banner.textContent = errMsg;
                }
                return;
            }

            // Successfully triggered: update to collecting stage
            updateProgressStage(2, `Collecting reviews (0/${currentReviewTarget})…`, 'Reading customer review section', 40);
        });
    });
};

const handleCancelScan = () => {
    if (activeScanTabId) {
        chrome.tabs.sendMessage(activeScanTabId, { action: 'CANCEL_SCAN' }, () => {
            // Ignored if unsupported
        });
    }
    cleanupActiveScan();
    resetScanUI();
    const banner = document.getElementById('connection-banner');
    if (banner) {
        banner.className = 'status-banner info';
        banner.textContent = 'Scan cancelled by user.';
    }
};

const cleanupActiveScan = () => {
    if (activeSafetyTimer) {
        clearTimeout(activeSafetyTimer);
        activeSafetyTimer = null;
    }
    if (activeScanListener) {
        chrome.runtime.onMessage.removeListener(activeScanListener);
        activeScanListener = null;
    }
    activeScanTabId = null;
};

const resetScanUI = () => {
    const scanBtn = document.getElementById('popup-scan-btn');
    const scanBtnText = document.getElementById('popup-scan-btn-text');
    const progressCard = document.getElementById('scanning-progress');

    if (scanBtn) scanBtn.disabled = false;
    if (scanBtnText) scanBtnText.textContent = 'Scan Reviews';
    if (progressCard) progressCard.classList.add('hidden');
};

// ─── DASHBOARD & FULL REPORT NAVIGATION ────────────────────────────────────

const handleOpenDashboard = () => {
    chrome.runtime.sendMessage({ action: 'OPEN_DASHBOARD', route: '#dashboard' }, (res) => {
        if (chrome.runtime.lastError || !res?.success) {
            console.warn('[EchoTrace] Could not open dashboard:', chrome.runtime.lastError?.message || res?.error);
        }
    });
};

const handleViewReportClick = (e) => {
    e.preventDefault();
    const reportBtn = document.getElementById('results-view-report');
    if (reportBtn?.dataset.loading === 'true') return;
    if (reportBtn) {
        reportBtn.dataset.loading = 'true';
        reportBtn.textContent = 'Opening…';
    }

    chrome.storage.local.get(["last_scan_result"], (items) => {
        const scanId = items.last_scan_result?.scan_id || "";
        chrome.runtime.sendMessage({
            action: 'OPEN_FULL_REPORT',
            scan_id: scanId
        }, (response) => {
            if (reportBtn) {
                reportBtn.dataset.loading = 'false';
                reportBtn.textContent = '📊 Full Report';
            }
            if (chrome.runtime.lastError || !response?.success) {
                console.warn('[EchoTrace] Unable to open full report:', chrome.runtime.lastError?.message || response?.error);
            }
        });
    });
};

const handleViewModalClick = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'OPEN_RESULTS_MODAL' }, () => {
            window.close(); // Close popup so user sees full in-page modal
        });
    });
};

// ─── USER & CONFIGURATION STATE ────────────────────────────────────────────

const initPopup = () => {
    // Migration: audit legacy saved custom api_url and remove to enforce trusted endpoint
    chrome.storage.local.get(["api_url", "auth_token", "username"], (items) => {
        if (items.api_url) {
            chrome.storage.local.remove(["api_url"]);
        }

        checkApiHealth(DEFAULT_API_URL);
        loadUserState();
        loadLastScanResult();
    });
};

const checkApiHealth = async (apiUrl) => {
    const banner = document.getElementById('connection-banner');
    const settingsStatus = document.getElementById('settings-engine-status');
    const offlineMsgRow = document.getElementById('settings-offline-msg-row');

    if (banner) {
        banner.className = "status-banner info";
        banner.textContent = "Checking system status...";
    }
    if (settingsStatus) {
        settingsStatus.className = "settings-pill checking";
        settingsStatus.textContent = "Checking…";
    }
    if (offlineMsgRow) offlineMsgRow.style.display = "none";

    const healthUrl = `${apiUrl}?route=system/health`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(healthUrl, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            if (data.status === 'online') {
                if (banner) {
                    banner.className = "status-banner success";
                    banner.textContent = "EchoTrace Engine: Online";
                }
                if (settingsStatus) {
                    settingsStatus.className = "settings-pill online";
                    settingsStatus.textContent = "Online";
                }
                return;
            }
        }
        throw new Error('Non-200 health response');
    } catch (err) {
        if (banner) {
            banner.className = "status-banner error";
            banner.textContent = "EchoTrace API: Offline (Laragon stopped)";
        }
        if (settingsStatus) {
            settingsStatus.className = "settings-pill offline";
            settingsStatus.textContent = "Offline";
        }
        if (offlineMsgRow) offlineMsgRow.style.display = "block";
    }
};

const loadUserState = () => {
    chrome.storage.local.get(["auth_token", "username", "email", "auth_provider"], (items) => {
        const token = items.auth_token;
        const username = items.username;

        if (token && username) {
            const userEl = document.getElementById('user-display-name');
            if (userEl) userEl.textContent = username;
            showPane('dashboard');
        } else {
            showPane('login');
        }
    });
};

const showPane = (paneName) => {
    document.querySelectorAll('.pane').forEach(el => el.classList.add('hidden'));
    const pane = document.getElementById(`status-${paneName}`);
    if (pane) pane.classList.remove('hidden');
};

const openSettingsPane = () => {
    chrome.storage.local.get(["auth_token", "username", "email", "auth_provider", "review_target"], (items) => {
        const isAuth = !!(items.auth_token && items.username);
        const nameEl = document.getElementById('settings-account-name');
        const emailRow = document.getElementById('settings-email-row');
        const emailEl = document.getElementById('settings-account-email');
        const providerEl = document.getElementById('settings-auth-provider');
        const actionBtn = document.getElementById('settings-auth-action-btn');
        const versionEl = document.getElementById('settings-ext-version');
        const syncStatus = document.getElementById('settings-sync-status');

        if (nameEl) nameEl.textContent = isAuth ? items.username : 'Not signed in';
        if (emailRow && emailEl) {
            if (isAuth && items.email) {
                emailRow.style.display = 'flex';
                emailEl.textContent = items.email;
            } else {
                emailRow.style.display = 'none';
            }
        }
        if (providerEl) {
            providerEl.textContent = isAuth ? (items.auth_provider === 'google' ? 'Google' : 'Email / Password') : '--';
        }
        if (syncStatus) {
            syncStatus.textContent = isAuth ? 'Enabled' : 'Disabled';
            syncStatus.className = isAuth ? 'settings-pill online' : 'settings-pill offline';
        }
        if (actionBtn) {
            actionBtn.textContent = isAuth ? 'Sign Out' : 'Sign In';
            actionBtn.className = isAuth ? 'btn secondary-btn' : 'btn primary-btn';
        }

        // Extension version directly from manifest
        if (versionEl) {
            try {
                const manifest = chrome.runtime.getManifest();
                versionEl.textContent = `v${manifest.version}`;
            } catch (_) {
                versionEl.textContent = 'v1.0.2';
            }
        }

        // Sync scan limit
        const target = items.review_target || currentReviewTarget || 10;
        updateSettingsTargetChipsUI(Number(target));

        // Refresh connection check
        checkApiHealth(DEFAULT_API_URL);

        showPane('settings');
    });
};

const handleSettingsAuthAction = () => {
    chrome.storage.local.get(["auth_token"], (items) => {
        if (items.auth_token) {
            handleLogout();
            openSettingsPane();
        } else {
            showPane('login');
        }
    });
};

const initSettingsTargetChips = () => {
    document.querySelectorAll('[data-settings-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.settingsTarget, 10);
            if ([10, 20, 50].includes(val)) {
                currentReviewTarget = val;
                chrome.storage.local.set({ review_target: val }, () => {
                    updateSettingsTargetChipsUI(val);
                    updateTargetChipsUI(val);
                });
            }
        });
    });
};

const updateSettingsTargetChipsUI = (selected) => {
    const displayEl = document.getElementById('settings-target-display');
    if (displayEl) displayEl.textContent = `${selected} reviews`;

    document.querySelectorAll('[data-settings-target]').forEach(btn => {
        const val = parseInt(btn.dataset.settingsTarget, 10);
        if (val === selected) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
};

const handleLogin = async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    if (errorEl) errorEl.classList.add('hidden');

    const usernameOrEmail = document.getElementById('login-input').value;
    const password = document.getElementById('login-password').value;
    const loginUrl = `${DEFAULT_API_URL}?route=auth/login`;

    try {
        const response = await fetch(loginUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username_or_email: usernameOrEmail, password })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            chrome.storage.local.set({
                auth_token: data.token,
                username: data.user.username,
                email: data.user.email || '',
                user_id: data.user.id,
                auth_provider: 'password'
            }, () => {
                const form = document.getElementById('login-form');
                if (form) form.reset();
                loadUserState();
            });
        } else {
            if (errorEl) {
                errorEl.textContent = data.error || "Authentication failed.";
                errorEl.classList.remove('hidden');
            }
        }
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = "Unable to connect to local PHP server.";
            errorEl.classList.remove('hidden');
        }
    }
};

const handleLogout = () => {
    chrome.storage.local.remove(["auth_token", "username", "email", "user_id", "auth_provider", "last_scan_result"], () => {
        loadUserState();
    });
};

// ─── PKCE & CRYPTO HELPERS ────────────────────────────────────────────────
const generateRandomString = (length = 43) => {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
        result += charset[randomValues[i] % charset.length];
    }
    return result;
};

const sha256 = async (plain) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return hash;
};

const base64UrlEncode = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

// ─── PENDING AUTHENTICATION STATE ──────────────────────────────────────────
let pendingAuthEmail = '';
let otpCooldownInterval = null;

const showOtpSection = (email, maskedEmail) => {
    pendingAuthEmail = email;
    const targetEl = document.getElementById('otp-email-target');
    const input = document.getElementById('otp-input');
    const errorEl = document.getElementById('otp-error');
    const successEl = document.getElementById('otp-success');

    if (targetEl) targetEl.textContent = maskedEmail ? `Sent to: ${maskedEmail}` : email;
    if (errorEl) errorEl.classList.add('hidden');
    if (successEl) successEl.classList.add('hidden');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 150);
    }
    showPane('otp');
};

const handleOtpSubmit = async (e) => {
    e.preventDefault();
    const otpInput = document.getElementById('otp-input');
    const otp = otpInput ? otpInput.value.trim() : '';
    const errorEl = document.getElementById('otp-error');
    const submitBtn = document.getElementById('otp-submit-btn');

    if (!pendingAuthEmail) {
        if (errorEl) {
            errorEl.textContent = 'Session lost. Please sign in again.';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (!otp || otp.length !== 6) {
        if (errorEl) {
            errorEl.textContent = 'Please enter the 6-digit code.';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (errorEl) errorEl.classList.add('hidden');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying…';
    }

    try {
        const res = await fetch(`${DEFAULT_API_URL}?route=auth/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingAuthEmail, otp: otp })
        });

        const data = await res.json();
        if (res.ok && data.success && data.token) {
            // Save session
            chrome.storage.local.set({
                auth_token: data.token,
                username: data.user.username,
                email: data.user.email || '',
                user_id: data.user.id,
                auth_provider: 'google'
            }, () => {
                loadUserState();
            });
        } else {
            if (errorEl) {
                errorEl.textContent = data.error || 'Verification failed. Please check your code.';
                errorEl.classList.remove('hidden');
            }
        }
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = 'Could not reach server for verification.';
            errorEl.classList.remove('hidden');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Verify & Sign In';
        }
    }
};

const handleOtpResend = async () => {
    const errorEl = document.getElementById('otp-error');
    const successEl = document.getElementById('otp-success');
    const resendBtn = document.getElementById('otp-resend-btn');

    if (!pendingAuthEmail) return;

    if (resendBtn) resendBtn.disabled = true;

    try {
        const res = await fetch(`${DEFAULT_API_URL}?route=auth/resend-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingAuthEmail })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            if (successEl) {
                successEl.textContent = data.message || 'A fresh code was sent to your email.';
                successEl.classList.remove('hidden');
            }
            if (errorEl) errorEl.classList.add('hidden');
            startOtpResendCountdown(60);
        } else {
            if (errorEl) {
                errorEl.textContent = data.error || 'Unable to resend code.';
                errorEl.classList.remove('hidden');
            }
            if (resendBtn) resendBtn.disabled = false;
        }
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = 'Failed to connect to server.';
            errorEl.classList.remove('hidden');
        }
        if (resendBtn) resendBtn.disabled = false;
    }
};

const startOtpResendCountdown = (seconds) => {
    const resendBtn = document.getElementById('otp-resend-btn');
    if (!resendBtn) return;
    if (otpCooldownInterval) clearInterval(otpCooldownInterval);

    let left = seconds;
    resendBtn.disabled = true;
    resendBtn.textContent = `Resend in ${left}s`;

    otpCooldownInterval = setInterval(() => {
        left--;
        if (left <= 0) {
            clearInterval(otpCooldownInterval);
            otpCooldownInterval = null;
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend Code';
        } else {
            resendBtn.textContent = `Resend in ${left}s`;
        }
    }, 1000);
};

// ─── GOOGLE AUTHENTICATION VIA CHROME.IDENTITY ──────────────────────────────
const handleGoogleAuth = async () => {
    const errorEl = document.getElementById('login-error');
    const googleBtn = document.getElementById('google-auth-btn');
    const btnText = document.getElementById('google-btn-text');

    if (errorEl) errorEl.classList.add('hidden');

    if (googleBtn) googleBtn.disabled = true;
    if (btnText) btnText.textContent = "Connecting to Google…";

    try {
        // Fetch server-configured client ID for extension
        const res = await fetch(`${DEFAULT_API_URL}?route=auth/google-client-id&client_type=extension`);
        const data = await res.json();
        const clientId = data?.client_id;

        if (!clientId) {
            throw new Error("Google Client ID is not configured on the backend.");
        }

        // Generate PKCE code_verifier and code_challenge
        const codeVerifier = generateRandomString(64);
        const codeChallengeHashed = await sha256(codeVerifier);
        const codeChallenge = base64UrlEncode(codeChallengeHashed);

        const redirectUri = chrome.identity.getRedirectURL();
        console.log('[EchoTrace Extension] Google OAuth Redirect URI:', redirectUri);
        const state = generateRandomString(32);

        // Build OAuth2 Authorization URL using response_type=code
        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("scope", "openid email profile");
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
        authUrl.searchParams.set("prompt", "select_account");
        authUrl.searchParams.set("access_type", "offline");

        chrome.identity.launchWebAuthFlow(
            {
                url: authUrl.toString(),
                interactive: true
            },
            async (redirectUrl) => {
                if (chrome.runtime.lastError || !redirectUrl) {
                    const rawMsg = chrome.runtime.lastError?.message || "Google sign-in was cancelled.";
                    let friendlyMsg = rawMsg;
                    if (rawMsg.includes("User cancelled") || rawMsg.includes("canceled")) {
                        friendlyMsg = "Google sign-in cancelled.";
                    } else if (rawMsg.includes("redirect_uri_mismatch") || rawMsg.includes("bad client id") || rawMsg.includes("authorization page could not be loaded")) {
                        friendlyMsg = `OAuth configuration issue: Ensure redirect URI ${redirectUri} is registered in Google Cloud Console.`;
                    }
                    if (errorEl) {
                        errorEl.textContent = friendlyMsg;
                        errorEl.classList.remove('hidden');
                    }
                    if (googleBtn) googleBtn.disabled = false;
                    if (btnText) btnText.textContent = "Continue with Google";
                    return;
                }

                // Extract authorization code and state from redirect URL
                try {
                    const parsedUrl = new URL(redirectUrl);
                    const queryParams = parsedUrl.searchParams;

                    // Check for OAuth error response
                    const oauthError = queryParams.get("error");
                    const errorDesc = queryParams.get("error_description");
                    if (oauthError) {
                        let msg = `Google OAuth Error: ${oauthError}`;
                        if (oauthError === 'redirect_uri_mismatch') {
                            msg = `Redirect URI mismatch. Please add ${redirectUri} to Authorized Redirect URIs in Google Cloud Console.`;
                        } else if (oauthError === 'access_denied') {
                            msg = "Access was denied by the user or account.";
                        } else if (errorDesc) {
                            msg = `${oauthError}: ${decodeURIComponent(errorDesc)}`;
                        }
                        throw new Error(msg);
                    }

                    const returnedState = queryParams.get("state");
                    if (returnedState !== state) {
                        throw new Error("OAuth security state mismatch. Authentication aborted.");
                    }

                    const authCode = queryParams.get("code");
                    if (!authCode) {
                        throw new Error("No authorization code returned by Google.");
                    }

                    // Exchange authorization code server-side with PKCE verifier
                    const exchangeRes = await fetch(`${DEFAULT_API_URL}?route=auth/google-code-exchange`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            code: authCode,
                            redirect_uri: redirectUri,
                            code_verifier: codeVerifier
                        })
                    });

                    const exchangeData = await exchangeRes.json();
                    if (exchangeRes.ok && exchangeData.success && exchangeData.requires_verification) {
                        // Display OTP verification UI in extension popup!
                        showOtpSection(exchangeData.email, exchangeData.email_masked);
                    } else {
                        if (errorEl) {
                            errorEl.textContent = exchangeData.error || "Google authorization rejected.";
                            errorEl.classList.remove('hidden');
                        }
                    }
                } catch (parseErr) {
                    if (errorEl) {
                        errorEl.textContent = parseErr.message || "Failed to process Google sign-in.";
                        errorEl.classList.remove('hidden');
                    }
                } finally {
                    if (googleBtn) googleBtn.disabled = false;
                    if (btnText) btnText.textContent = "Continue with Google";
                }
            }
        );
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = err.message || "Could not start Google sign-in.";
            errorEl.classList.remove('hidden');
        }
        if (googleBtn) googleBtn.disabled = false;
        if (btnText) btnText.textContent = "Continue with Google";
    }
};

// ─── SCAN RESULTS RENDERING ────────────────────────────────────────────────

const loadLastScanResult = () => {
    chrome.storage.local.get(["last_scan_result"], (items) => {
        if (items.last_scan_result) {
            displayScanResults(items.last_scan_result);
        }
    });
};

const animateValue = (el, start, end, duration = 650) => {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(easeOut * (end - start) + start);
        el.textContent = `${current}%`;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            el.textContent = `${Math.round(end)}%`;
        }
    };
    window.requestAnimationFrame(step);
};

const displayScanResults = (data) => {
    const panel = document.getElementById('scan-results-panel');
    const scanningProgress = document.getElementById('scanning-progress');
    const scoreEl = document.getElementById('results-score-value');
    const circleEl = document.getElementById('results-score-circle');
    const titleEl = document.getElementById('results-product-title');
    const riskBadge = document.getElementById('results-risk-badge');
    const ratingBadge = document.getElementById('results-rating-badge');
    const reviewCount = document.getElementById('results-review-count');

    const ratioGenuineLabel = document.getElementById('ratio-label-genuine');
    const ratioFakeLabel = document.getElementById('ratio-label-fake');
    const ratioBarGenuine = document.getElementById('ratio-bar-genuine');
    const ratioBarFake = document.getElementById('ratio-bar-fake');

    const statTotal = document.getElementById('stat-total');
    const statFake = document.getElementById('stat-fake');
    const statGenuine = document.getElementById('stat-genuine');
    const statUncertain = document.getElementById('stat-uncertain');

    const flaggedSection = document.getElementById('flagged-reviews-section');
    const flaggedCountLabel = document.getElementById('flagged-count-label');
    const flaggedList = document.getElementById('flagged-reviews-list');

    if (!panel) return;
    if (scanningProgress) scanningProgress.classList.add('hidden');

    const trustScore = parseFloat(data.trust_score || 0);
    if (scoreEl) {
        animateValue(scoreEl, 0, trustScore, 650);
    }

    if (circleEl) {
        circleEl.classList.remove('warn', 'danger');
        if (trustScore < 50) circleEl.classList.add('danger');
        else if (trustScore < 80) circleEl.classList.add('warn');
    }

    if (titleEl) {
        titleEl.textContent = data.product_title || data.product?.title || 'Product Audit';
    }

    const riskLevel = (data.overall_risk_level || (trustScore >= 80 ? 'Low Risk' : (trustScore >= 50 ? 'Moderate Risk' : 'High Risk'))).toUpperCase();
    if (riskBadge) {
        riskBadge.textContent = riskLevel;
        riskBadge.classList.remove('warn', 'danger');
        if (riskLevel.includes('HIGH')) riskBadge.classList.add('danger');
        else if (riskLevel.includes('MEDIUM') || riskLevel.includes('MODERATE')) riskBadge.classList.add('warn');
    }

    const avgRating = data.metrics?.average_rating || data.rating || null;
    const adjRating = data.metrics?.adjusted_rating || null;
    if (ratingBadge) {
        if (avgRating !== null && adjRating !== null) {
            ratingBadge.textContent = `⭐ ${parseFloat(avgRating).toFixed(1)} → 🛡️ ${parseFloat(adjRating).toFixed(1)}`;
            ratingBadge.classList.remove('hidden');
        } else {
            ratingBadge.classList.add('hidden');
        }
    }

    const results = Array.isArray(data.results) ? data.results : [];
    const total = (data.metrics?.total_scanned) || results.length || 0;
    const fake = (data.metrics?.fake_detected) || results.filter(r => r.is_fake && !(Number(r.confidence_score) >= 40 && Number(r.confidence_score) <= 60)).length;
    const genuine = (data.metrics?.genuine_detected) || results.filter(r => !r.is_fake && !(Number(r.confidence_score) >= 40 && Number(r.confidence_score) <= 60)).length;
    const uncertain = (data.metrics?.uncertain_detected) || (total - fake - genuine > 0 ? total - fake - genuine : 0);

    const genuinePct = total > 0 ? Math.round((genuine / total) * 100) : 100;
    const fakePct = total > 0 ? Math.round((fake / total) * 100) : 0;

    if (reviewCount) {
        const target = data.target || currentReviewTarget;
        if (total < target) {
            reviewCount.textContent = `${total} of ${target} target reviews collected (${total} accessible)`;
        } else {
            reviewCount.textContent = `${total} reviews analyzed • ${fake} suspicious`;
        }
    }

    if (ratioGenuineLabel) ratioGenuineLabel.textContent = `✅ ${genuinePct}% Genuine (${genuine})`;
    if (ratioFakeLabel) ratioFakeLabel.textContent = `🚨 ${fakePct}% Suspicious (${fake})`;
    if (ratioBarGenuine) ratioBarGenuine.style.width = `${genuinePct}%`;
    if (ratioBarFake) ratioBarFake.style.width = `${fakePct}%`;

    if (statTotal) statTotal.textContent = total;
    if (statFake) statFake.textContent = fake;
    if (statGenuine) statGenuine.textContent = genuine;
    if (statUncertain) statUncertain.textContent = uncertain;

    // Flagged reviews
    const flaggedReviews = results.filter(r => {
        const p = Number(r.confidence_score);
        return r.is_fake && !(p >= 40 && p <= 60);
    });

    if (flaggedSection && flaggedCountLabel && flaggedList) {
        if (flaggedReviews.length > 0) {
            flaggedCountLabel.textContent = `⚠️ Flagged Suspicious Reviews (${flaggedReviews.length})`;
            flaggedSection.classList.remove('hidden');
            flaggedList.innerHTML = '';
            flaggedReviews.slice(0, 5).forEach(r => {
                const item = document.createElement('div');
                item.className = 'flagged-item';
                const snippet = (r.text || '').length > 100 ? (r.text || '').substring(0, 100) + '…' : (r.text || '');
                const reasons = (r.fake_reasons && r.fake_reasons.length > 0) ? r.fake_reasons.slice(0, 2) : ['Pattern match'];

                const textEl = document.createElement('div');
                textEl.className = 'flagged-item-text';
                textEl.textContent = `"${snippet}"`;

                const tagsEl = document.createElement('div');
                tagsEl.className = 'flagged-item-reasons';
                reasons.forEach(rs => {
                    const tag = document.createElement('span');
                    tag.className = 'flagged-reason-tag';
                    tag.textContent = rs;
                    tagsEl.appendChild(tag);
                });

                item.appendChild(textEl);
                item.appendChild(tagsEl);
                flaggedList.appendChild(item);
            });
        } else {
            flaggedSection.classList.add('hidden');
        }
    }

    panel.classList.remove('hidden');
};

const toggleFlaggedReviews = () => {
    const list = document.getElementById('flagged-reviews-list');
    const arrow = document.getElementById('toggle-flagged-arrow');
    if (!list) return;

    const isHidden = list.classList.contains('hidden');
    if (isHidden) {
        list.classList.remove('hidden');
        if (arrow) arrow.textContent = '▲';
    } else {
        list.classList.add('hidden');
        if (arrow) arrow.textContent = '▼';
    }
};

const dismissResults = () => {
    const panel = document.getElementById('scan-results-panel');
    if (panel) panel.classList.add('hidden');
    chrome.storage.local.remove(["last_scan_result"]);
};

// ─── RUNTIME MESSAGE LISTENERS ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "SCAN_RESULT") {
        displayScanResults(message.data);
        sendResponse({ received: true });
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.last_scan_result?.newValue) {
        displayScanResults(changes.last_scan_result.newValue);
    }
});
