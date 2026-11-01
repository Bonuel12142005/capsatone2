// Transfers only the saved scan ID from the MV3 worker to the EchoTrace page.
// Authentication remains in the web application and is never placed in a URL.
(() => {
    const PENDING_REPORT_KEY = "pending_dashboard_report";
    const MAX_PENDING_AGE_MS = 5 * 60 * 1000;
    const isValidScanId = (value) => /^\d+$/.test(String(value || "")) && Number(value) > 0;
    const isAllowedDashboardOrigin = (origin) => [
        'http://localhost:8000',
        'http://127.0.0.1:8000',
        'http://localhost',
        'http://127.0.0.1'
    ].includes(origin);

    const deliver = (scanId) => {
        if (!isValidScanId(scanId)) return false;
        window.postMessage({
            source: "ECHOTRACE_EXTENSION",
            type: "OPEN_FULL_REPORT",
            scan_id: String(scanId)
        }, window.location.origin);
        return true;
    };

    const consumePendingReport = async () => {
        const items = await chrome.storage.local.get([PENDING_REPORT_KEY]);
        const pending = items[PENDING_REPORT_KEY];
        if (!pending) return;
        await chrome.storage.local.remove([PENDING_REPORT_KEY]);
        const isFresh = Number.isFinite(pending.requested_at)
            && Date.now() - pending.requested_at <= MAX_PENDING_AGE_MS;
        if (isFresh) deliver(pending.scan_id);
    };

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.action === "SCAN_SAVED") {
            window.postMessage({
                source: "ECHOTRACE_EXTENSION",
                type: "SCAN_SAVED",
                scan_id: String(message.scan_id || "")
            }, window.location.origin);
            sendResponse({ success: true });
            return;
        }
        if (message.action === 'MANUAL_SCAN_COMPLETED' || message.action === 'MANUAL_SCAN_FAILED') {
            window.postMessage({ source: 'ECHOTRACE_EXTENSION', type: message.action, data: message.data || null, error: message.error || null }, window.location.origin);
            sendResponse({ success: true });
            return;
        }
        if (message.action !== "OPEN_REPORT_IN_DASHBOARD") return;
        const delivered = deliver(message.scan_id);
        if (delivered) chrome.storage.local.remove([PENDING_REPORT_KEY]);
        sendResponse({ success: delivered });
    });

    // The dashboard never needs an extension ID. Its page request is relayed
    // only when it originated from this exact dashboard origin; the worker
    // then selects a supported product tab and returns DOM-visible reviews.
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (event.source !== window || !isAllowedDashboardOrigin(event.origin)
            || message?.source !== 'ECHOTRACE_DASHBOARD'
            || message?.type !== 'REQUEST_ACTIVE_TAB_REVIEWS') return;

        const requestId = String(message.request_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
        const url = String(message.url || '').trim();
        if (!requestId || !url) return;

        try {
            chrome.runtime.sendMessage({
                action: 'REQUEST_ACTIVE_TAB_REVIEWS',
                request_id: requestId,
                url
            }, (response) => {
                let runtimeError = null;
                try { runtimeError = chrome.runtime.lastError; } catch (_) { runtimeError = { message: 'Extension context invalidated.' }; }
                window.postMessage({
                    source: 'ECHOTRACE_EXTENSION',
                    type: 'MANUAL_REVIEWS_RESPONSE',
                    request_id: requestId,
                    data: runtimeError ? null : (response?.data || null),
                    error: runtimeError?.message || response?.error || null
                }, window.location.origin);
            });
        } catch (error) {
            window.postMessage({
                source: 'ECHOTRACE_EXTENSION',
                type: 'MANUAL_REVIEWS_RESPONSE',
                request_id: requestId,
                data: null,
                error: error.message || 'The EchoTrace extension is unavailable. Reload the extension and retry.'
            }, window.location.origin);
        }
    });

    consumePendingReport().catch((error) => {
        console.warn("[EchoTrace] Could not consume pending report request:", error);
    });
})();
