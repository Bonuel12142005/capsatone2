// chrome_extension/scripts/background.js
// EchoTrace Service Worker (Manifest V3)

importScripts('config.js');

const DEFAULT_PHP_API = EchoTraceConfig.API_URL;
const ECHOTRACE_APP_URL = EchoTraceConfig.FRONTEND_URL;
const PENDING_REPORT_KEY = "pending_dashboard_report";
let pendingManualScan = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'REQUEST_ACTIVE_TAB_REVIEWS') {
        if (!sender.url || !isEchoTraceDashboard(sender.url)) {
            sendResponse({ success: false, error: 'Only the EchoTrace dashboard may request browser-visible reviews.' });
            return false;
        }
        extractFromProductTab(request.url, sender.tab?.windowId).then(sendResponse).catch((error) => {
            sendResponse({ success: false, error: error.message || 'The active product tab could not be scanned.' });
        });
        return true;
    }
    if (request.action === "EXECUTE_SCAN") {
        chrome.storage.local.get(["auth_token"], (items) => {
            handleScan(request.data, items, sender).then(sendResponse).catch((err) => {
                sendResponse({ success: false, error: err.message });
            });
        });
        return true; // keep channel open for async
    }
    if (request.action === "OPEN_FULL_REPORT") {
        openReportInDashboard(request.scan_id, EchoTraceConfig.API_URL)
            .then(sendResponse)
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.action === "OPEN_DASHBOARD") {
        openDashboard(EchoTraceConfig.API_URL, request.route || '#dashboard')
            .then(sendResponse)
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request?.action !== 'MANUAL_URL_SCAN' || !sender.url || !isEchoTraceDashboard(sender.url)) return;
    startManualUrlScan(request.url, sender.tab?.id).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
});

function isEchoTraceDashboard(url) {
    try {
        const page = new URL(url);
        const isAllowedOrigin = [
            'http://localhost', 'http://127.0.0.1',
            'http://localhost:8000', 'http://127.0.0.1:8000'
        ].includes(page.origin);
        const isAppPath = page.pathname === '/'
            || page.pathname.startsWith('/capsatone2/frontend/')
            || page.pathname === '/capsatone2/frontend/index.html';
        return isAllowedOrigin && isAppPath;
    } catch (_) { return false; }
}

function supportedProductUrl(value) {
    try {
        const page = new URL(value);
        return ['shopee.ph', 'shopee.sg', 'shopee.com.my', 'shopee.co.id',
            'lazada.com.ph', 'lazada.sg', 'lazada.com.my', 'lazada.co.id',
            'amazon.com', 'amazon.co.uk', 'amazon.com.ph', 'ebay.com', 'aliexpress.com', 'walmart.com', 'tiktok.com'].some(domain => page.hostname === domain || page.hostname.endsWith('.' + domain));
    } catch (_) {
        return false;
    }
}

async function extractFromProductTab(targetUrl, preferredWindowId) {
    if (!supportedProductUrl(targetUrl)) {
        return { success: false, error: 'The provided product URL is not a supported ecommerce page.' };
    }

    const tabs = await chrome.tabs.query({});
    const normalizedTarget = new URL(targetUrl).href;
    const candidates = tabs.filter(tab => {
        if (!tab.url) return false;
        try {
            return new URL(tab.url).href === normalizedTarget;
        } catch (_) {
            return false;
        }
    });

    if (!candidates.length) {
        return { success: false, error: 'Open the product page in another browser tab, scroll to its reviews, and retry.' };
    }

    const productTab = (preferredWindowId != null && candidates.find(tab => tab.windowId === preferredWindowId)) || candidates[0];
    if (productTab.status !== 'complete') {
        return { success: false, error: 'The product tab is still loading. Wait for the reviews to appear and retry.' };
    }

    let response = null;
    try {
        response = await chrome.tabs.sendMessage(productTab.id, { action: 'EXTRACT_VISIBLE_REVIEWS' });
    } catch (error) {
        return { success: false, error: 'Could not communicate with the product page. Refresh the product tab and retry.' };
    }

    const data = response?.data;
    const reviews = Array.isArray(data?.reviews) ? data.reviews.filter(review => review && typeof review.text === 'string' && review.text.trim()) : [];
    if (!response?.success || !reviews.length) {
        return { success: false, error: data?.extraction_note || 'No customer reviews are visible on the product page. Open the reviews section and retry.' };
    }
    return { success: true, data: { ...data, reviews: reviews.slice(0, 100), source: 'extension_visible_reviews' } };
}

async function startManualUrlScan(rawUrl, dashboardTabId) {
    if (!Number.isInteger(dashboardTabId)) return { success: false, error: 'Open EchoTrace in a browser tab before starting a manual scan.' };
    if (!supportedProductUrl(rawUrl)) return { success: false, error: 'The provided URL is not a supported ecommerce product page.' };
    if (pendingManualScan) return { success: false, error: 'A manual extension scan is already in progress.' };

    const productTab = await chrome.tabs.create({ url: rawUrl, active: true });
    await waitForTabComplete(productTab.id);
    pendingManualScan = { dashboardTabId, url: rawUrl, productTabId: productTab.id, requestedAt: Date.now() };
    try {
        const response = await chrome.tabs.sendMessage(productTab.id, { action: 'TRIGGER_SCAN' });
        if (!response?.success) { pendingManualScan = null; return { success: false, error: response?.error || 'The product page could not start review extraction.' }; }
        return { success: true, message: 'Product page opened. Extracting accessible reviews with EchoTrace.' };
    } catch (err) {
        pendingManualScan = null;
        return { success: false, error: 'Could not contact EchoTrace content script on product page.' };
    }
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpdated); resolve(); }, timeoutMs);
        function onUpdated(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                clearTimeout(timeout);
                chrome.tabs.onUpdated.removeListener(onUpdated);
                resolve();
            }
        }
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
}

function resolveFrontendBase(apiBase) {
    let frontendBase = ECHOTRACE_APP_URL;
    try {
        const apiUrl = new URL(String(apiBase || DEFAULT_PHP_API));
        if (apiUrl.pathname.includes('/capsatone2/')) {
            frontendBase = apiUrl.origin + '/capsatone2/frontend/';
        } else {
            frontendBase = apiUrl.origin + '/';
        }
    } catch (_) { }
    return frontendBase;
}

async function openDashboard(apiBase, route = '#dashboard') {
    const frontendBase = resolveFrontendBase(apiBase);
    const targetUrl = frontendBase + (route.startsWith('#') ? route : '#' + route);
    const frontend = new URL(frontendBase);

    const tabs = await chrome.tabs.query({});
    const appTabs = tabs.filter((tab) => {
        if (!tab.url) return false;
        try {
            const candidate = new URL(tab.url);
            return candidate.origin === frontend.origin && candidate.pathname === frontend.pathname;
        } catch (_) {
            return false;
        }
    });

    if (appTabs.length) {
        const appTab = appTabs[0];
        await chrome.tabs.update(appTab.id, { active: true });
        if (appTab.windowId != null) await chrome.windows.update(appTab.windowId, { focused: true });
        if (appTab.url !== targetUrl) {
            await chrome.tabs.update(appTab.id, { url: targetUrl, active: true });
        }
        return { success: true, reused: true, tab_id: appTab.id };
    }

    const createdTab = await chrome.tabs.create({ url: targetUrl, active: true });
    return { success: true, reused: false, tab_id: createdTab.id };
}

async function openReportInDashboard(rawScanId, apiBase) {
    const scanId = rawScanId == null ? "" : String(rawScanId).trim();
    if (!/^\d+$/.test(scanId) || Number(scanId) < 1) {
        return { success: false, error: "A valid saved scan ID is required." };
    }

    const frontendBase = resolveFrontendBase(apiBase);
    const dashboardUrl = frontendBase + "#dashboard";
    const frontend = new URL(frontendBase);
    const pendingReport = { scan_id: scanId, requested_at: Date.now() };

    const tabs = await chrome.tabs.query({});
    const appTabs = tabs.filter((tab) => {
        if (!tab.url) return false;
        try {
            const candidate = new URL(tab.url);
            return candidate.origin === frontend.origin && candidate.pathname === frontend.pathname;
        } catch (_) {
            return false;
        }
    });
    appTabs.sort((a, b) => {
        const aDashboard = a.url && a.url.endsWith("#dashboard") ? 1 : 0;
        const bDashboard = b.url && b.url.endsWith("#dashboard") ? 1 : 0;
        return bDashboard - aDashboard || (b.lastAccessed || 0) - (a.lastAccessed || 0);
    });

    await chrome.storage.local.set({ [PENDING_REPORT_KEY]: pendingReport });

    if (appTabs.length) {
        const appTab = appTabs[0];
        await chrome.tabs.update(appTab.id, { active: true });
        if (appTab.windowId != null) await chrome.windows.update(appTab.windowId, { focused: true });

        if (appTab.url !== dashboardUrl) {
            await chrome.tabs.update(appTab.id, { url: dashboardUrl, active: true });
        }
        try {
            await chrome.tabs.sendMessage(appTab.id, {
                action: "OPEN_REPORT_IN_DASHBOARD",
                scan_id: scanId
            });
        } catch (_) {
            await chrome.tabs.reload(appTab.id);
        }
        return { success: true, reused: true, tab_id: appTab.id };
    }

    const createdTab = await chrome.tabs.create({ url: dashboardUrl, active: true });
    return { success: true, reused: false, tab_id: createdTab.id };
}

async function handleScan(data, items, sender) {
    const apiBase = EchoTraceConfig.API_URL;
    const token = items.auth_token || "";

    if (!token) {
        return { success: false, error: "LOGIN_REQUIRED" };
    }
    const reviews = data && Array.isArray(data.reviews)
        ? data.reviews.filter((review) => review && typeof review.text === "string" && review.text.trim())
        : [];
    if (!reviews.length) {
        return { success: false, error: "No valid review text was extracted. Nothing was submitted." };
    }
    data = { ...data, reviews };

    // Extension sends extracted page reviews — use the manual-reviews route
    // which accepts a reviews array + metadata without requiring a product URL.
    const scanUrl = apiBase.includes("index.php")
        ? `${apiBase}?route=scan/manual-reviews`
        : `${apiBase}/scan/manual-reviews`;

    // Build the payload in the shape scan/manual-reviews expects:
    // { reviews, url, metadata: { title, external_id, image_url, rating }, source }
    const payload = {
        reviews: reviews,
        url: data.url || '',
        source: 'extension_visible_reviews',
        metadata: {
            title: data.title || '',
            external_id: data.external_id || '',
            image_url: data.image_url || '',
            rating: data.rating || 0,
        },
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const res = await fetch(scanUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            const problem = await res.json().catch(() => null);
            const failure = {
                success: false,
                error: res.status === 401 ? "LOGIN_REQUIRED" : (problem?.error || `Backend returned HTTP ${res.status}`)
            };
            if (failure.error !== "LOGIN_REQUIRED") {
                chrome.runtime.sendMessage({ action: "SCAN_ERROR", error: failure.error }).catch(() => { });
            }
            return failure;
        }

        const result = await res.json().catch(() => null);
        if (!result) {
            return { success: false, error: "Empty response from server" };
        }

        if (result.success) {
            result.product_title = data && data.title ? data.title : "Product";
            result.source_url = data && data.url ? data.url : "";
            chrome.storage.local.set({ last_scan_result: result });
            chrome.runtime.sendMessage({ action: "SCAN_RESULT", data: result }).catch(() => { });
            await notifyDashboardTabsOfSavedScan(result.scan_id);
            if (pendingManualScan && pendingManualScan.url === result.source_url) {
                await chrome.tabs.sendMessage(pendingManualScan.dashboardTabId, { action: 'MANUAL_SCAN_COMPLETED', data: result }).catch(() => { });
                pendingManualScan = null;
            }
        } else {
            chrome.runtime.sendMessage({ action: "SCAN_ERROR", error: result.error || "Scan failed" }).catch(() => { });
            if (pendingManualScan && pendingManualScan.url === data?.url) {
                await chrome.tabs.sendMessage(pendingManualScan.dashboardTabId, { action: 'MANUAL_SCAN_FAILED', error: result.error || 'Review analysis failed.' }).catch(() => { });
                pendingManualScan = null;
            }
        }

        return result;

    } catch (err) {
        const failure = {
            success: false,
            error: err.name === "AbortError"
                ? "The PHP scan request timed out. The scan was not confirmed as saved."
                : "The PHP backend is unreachable. The scan was not saved to Recent Audit History."
        };
        chrome.runtime.sendMessage({ action: "SCAN_ERROR", error: failure.error }).catch(() => { });
        if (pendingManualScan && pendingManualScan.url === data?.url) {
            await chrome.tabs.sendMessage(pendingManualScan.dashboardTabId, { action: 'MANUAL_SCAN_FAILED', error: failure.error }).catch(() => { });
            pendingManualScan = null;
        }
        return failure;
    }
}

async function notifyDashboardTabsOfSavedScan(scanId) {
    if (!scanId) return;
    const tabs = await chrome.tabs.query({
        url: [
            "http://localhost/*",
            "http://127.0.0.1/*",
            "http://localhost:8000/*",
            "http://127.0.0.1:8000/*"
        ]
    });
    const dashboardTabs = tabs.filter(tab => isEchoTraceDashboard(tab.url || ''));
    await Promise.allSettled(dashboardTabs.map((tab) => chrome.tabs.sendMessage(tab.id, {
        action: "SCAN_SAVED",
        scan_id: String(scanId)
    })));
}
