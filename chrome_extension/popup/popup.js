// chrome_extension/popup/popup.js

const DEFAULT_API_URL = "http://localhost:8000/api/index.php";

document.addEventListener('DOMContentLoaded', () => {
    initPopup();
    
    // Bind buttons
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    document.getElementById('settings-btn').addEventListener('click', () => showPane('settings'));
    document.getElementById('close-settings-btn').addEventListener('click', () => loadUserState());
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
    document.getElementById('close-results-btn').addEventListener('click', dismissResults);
});

// Clear session when popup closes (require fresh login for next session)
window.addEventListener('unload', () => {
    console.log('[EchoTrace] Popup closing - clearing session for next use');
    chrome.storage.local.remove(['auth_token', 'username'], () => {
        console.log('[EchoTrace] Session cleared - login required for next scan');
    });
});

const initPopup = () => {
    // Load current config and state
    chrome.storage.local.get(["api_url", "auth_token", "username"], (items) => {
        const apiUrl = items.api_url || DEFAULT_API_URL;
        document.getElementById('settings-api-url').value = apiUrl;
        
        checkApiHealth(apiUrl);
        loadUserState();
        loadLastScanResult();
    });
};

const checkApiHealth = async (apiUrl) => {
    const banner = document.getElementById('connection-banner');
    banner.className = "status-banner info";
    banner.textContent = "Checking API status...";

    // Extract base to hit health check
    const healthUrl = `${apiUrl}?route=auth/login`;
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

        const response = await fetch(healthUrl, { method: 'OPTIONS', signal: controller.signal });
        clearTimeout(timeoutId);

        banner.className = "status-banner success";
        banner.textContent = "EchoTrace System: Online";
    } catch (err) {
        banner.className = "status-banner error";
        banner.textContent = "EchoTrace System: Offline (Local server stopped)";
        console.error("Health check failed:", err);
    }
};

const loadUserState = () => {
    chrome.storage.local.get(["auth_token", "username"], (items) => {
        const token = items.auth_token;
        const username = items.username;

        if (token && username) {
            document.getElementById('user-display-name').textContent = username;
            showPane('dashboard');
        } else {
            showPane('login');
        }
    });
};

const showPane = (paneName) => {
    document.querySelectorAll('.pane').forEach(el => el.classList.add('hidden'));
    document.getElementById(`status-${paneName}`).classList.remove('hidden');
};

const handleLogin = async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('hidden');

    const usernameOrEmail = document.getElementById('login-input').value;
    const password = document.getElementById('login-password').value;

    chrome.storage.local.get(["api_url"], async (items) => {
        const apiUrl = items.api_url || DEFAULT_API_URL;
        const loginUrl = `${apiUrl}?route=auth/login`;

        try {
            const response = await fetch(loginUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username_or_email: usernameOrEmail, password: password })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                // Save credentials
                chrome.storage.local.set({
                    auth_token: data.token,
                    username: data.user.username
                }, () => {
                    document.getElementById('login-form').reset();
                    loadUserState();
                });
            } else {
                errorEl.textContent = data.error || "Authentication failed.";
                errorEl.classList.remove('hidden');
            }
        } catch (err) {
            errorEl.textContent = "Unable to connect to local PHP server.";
            errorEl.classList.remove('hidden');
        }
    });
};

const handleLogout = () => {
    chrome.storage.local.remove(["auth_token", "username"], () => {
        console.log('[EchoTrace] User logged out - session cleared');
        loadUserState();
    });
};

const saveSettings = () => {
    const rawUrl = document.getElementById('settings-api-url').value.trim();
    if (!rawUrl) return;

    chrome.storage.local.set({ api_url: rawUrl }, () => {
        alert("Configuration saved successfully.");
        checkApiHealth(rawUrl);
        loadUserState();
    });
};

// --- SCAN RESULTS DISPLAY ---

const loadLastScanResult = () => {
    chrome.storage.local.get(["last_scan_result"], (items) => {
        if (items.last_scan_result) {
            displayScanResults(items.last_scan_result);
        }
    });
};

const displayScanResults = (data) => {
    const panel = document.getElementById('scan-results-panel');
    const scoreEl = document.getElementById('results-score-value');
    const circleEl = document.getElementById('results-score-circle');
    const titleEl = document.getElementById('results-product-title');
    const riskBadge = document.getElementById('results-risk-badge');
    const reviewCount = document.getElementById('results-review-count');
    const strengthsUl = document.getElementById('results-strengths');
    const weaknessesUl = document.getElementById('results-weaknesses');
    const recEl = document.getElementById('results-recommendation');
    const reportLink = document.getElementById('results-view-report');

    const trustScore = parseFloat(data.trust_score || 0);
    scoreEl.textContent = `${trustScore.toFixed(0)}%`;

    // Color the score circle
    circleEl.classList.remove('warn', 'danger');
    if (trustScore < 50) {
        circleEl.classList.add('danger');
    } else if (trustScore < 80) {
        circleEl.classList.add('warn');
    }

    // Product title
    titleEl.textContent = data.product_title || data.product?.title || 'Product Scan';

    // Risk badge
    const riskLevel = (data.overall_risk_level || 'Low Risk').toUpperCase();
    riskBadge.textContent = riskLevel;
    riskBadge.classList.remove('warn', 'danger');
    if (riskLevel.includes('HIGH')) {
        riskBadge.classList.add('danger');
    } else if (riskLevel.includes('MEDIUM') || riskLevel.includes('MODERATE')) {
        riskBadge.classList.add('warn');
    }

    // Review count
    const total = (data.metrics?.total_scanned) || 0;
    const fake = (data.metrics?.fake_detected) || 0;
    const genuine = (data.metrics?.genuine_detected) || 0;
    reviewCount.textContent = `${total} reviews analyzed • ${fake} fake • ${genuine} genuine`;

    // Strengths
    strengthsUl.innerHTML = '';
    const strengths = data.summary?.strengths || [];
    strengths.forEach(s => {
        const li = document.createElement('li');
        li.textContent = s;
        strengthsUl.appendChild(li);
    });

    // Weaknesses
    weaknessesUl.innerHTML = '';
    const weaknesses = data.summary?.weaknesses || [];
    weaknesses.forEach(w => {
        const li = document.createElement('li');
        li.textContent = w;
        weaknessesUl.appendChild(li);
    });

    // Recommendation
    recEl.textContent = data.summary?.recommendation || '';

    // Report link
    if (data.scan_id) {
        chrome.storage.local.get(["auth_token"], (items) => {
            const token = items.auth_token;
            let reportUrl = `http://localhost/capsatone2/frontend/`;
            if (token) {
                // Pass token as query parameter (BEFORE hash) so it's in search string
                reportUrl += `?token=${encodeURIComponent(token)}`;
            }
            reportUrl += `#dashboard`;
            reportLink.href = reportUrl;
        });
        reportLink.classList.remove('hidden');
    } else {
        reportLink.classList.add('hidden');
    }

    panel.classList.remove('hidden');
};

const dismissResults = () => {
    document.getElementById('scan-results-panel').classList.add('hidden');
    chrome.storage.local.remove(["last_scan_result"]);
};

// Listen for scan results from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "SCAN_RESULT") {
        displayScanResults(message.data);
        sendResponse({ received: true });
    }
});
