// chrome_extension/scripts/config.js
// Centralized developer-controlled API and frontend endpoints for EchoTrace.
// Prevents tampering or storage redirection to untrusted hosts.

const EchoTraceConfig = (() => {
    // Trusted backend and frontend development defaults
    const TRUSTED_API_URL = "http://localhost/capsatone2/backend/api/index.php";
    const TRUSTED_FRONTEND_URL = "http://localhost/capsatone2/frontend/";

    // Allowlist of trusted origins
    const TRUSTED_ORIGINS = [
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ];

    /**
     * Sanitizes and verifies an API endpoint against the trusted allowlist.
     * Always falls back to TRUSTED_API_URL if invalid or untrusted.
     */
    const getApiUrl = () => {
        return TRUSTED_API_URL;
    };

    const getFrontendUrl = () => {
        return TRUSTED_FRONTEND_URL;
    };

    const isTrustedUrl = (urlStr) => {
        try {
            const parsed = new URL(urlStr);
            return TRUSTED_ORIGINS.includes(parsed.origin);
        } catch (_) {
            return false;
        }
    };

    return {
        API_URL: TRUSTED_API_URL,
        FRONTEND_URL: TRUSTED_FRONTEND_URL,
        getApiUrl,
        getFrontendUrl,
        isTrustedUrl
    };
})();

// Export for service worker (importScripts) or browser window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EchoTraceConfig;
}

